// /pagos-service/src/controllers/pagosController.js

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { pool, ...pagosModel } = require('../models/pagosModel');
const authMiddleware = require('../middleware/authMiddleware');

const USUARIOS_API_URL = 'http://localhost:3001/usuarios';
const CONTRATOS_API_URL = 'http://localhost:3003/contratos'; // URL base del microservicio de contratos
const ENTREGAS_API_URL = 'http://localhost:3005/entregas';

// Protegemos todas las rutas con autenticación
router.use(authMiddleware);

/**
 * [INTERNO] POST /pagos/ordenes -> Crea una nueva orden de pago.
 * Este endpoint es llamado por el microservicio de Contratos.
 */
router.post('/crearOrden', async (req, res) => {
    try {
        const { contrato_id, cliente_id, proveedor_id, total } = req.body;

        // 1. Validar que la información necesaria esté presente
        if (!contrato_id || !cliente_id || !proveedor_id || total === undefined) {
            return res.status(400).json({ message: 'Faltan datos para crear la orden de pago.' });
        }

        // 2. Verificar que no exista ya una orden para este contrato (evita duplicados)
        const ordenExistente = await pagosModel.buscarOrdenPorContratoId(contrato_id);
        if (ordenExistente) {
            return res.status(409).json({ message: 'Ya existe una orden de pago para este contrato.' });
        }

        // 3. Crear la nueva orden de pago
        const nuevaOrden = await pagosModel.crearOrdenDePago({
            contrato_id,
            cliente_id,
            proveedor_id,
            total
        });

        res.status(201).json({ 
            message: 'Orden de pago creada exitosamente.', 
            orden_id: nuevaOrden.id 
        });

    } catch (error) {
        res.status(500).json({ message: 'Error en el servidor al crear la orden de pago.', error: error.message });
    }
});

// --- NUEVAS RUTAS ---

/**
 * GET /pagos/ordenes -> Obtiene órdenes de pago según el rol del usuario.
 */
router.get('/mostrarOrdenes', async (req, res) => {
    try {
        const { id, tipo } = req.usuario;
        let ordenes = [];

        if (tipo === 'CLIENTE') {
            ordenes = await pagosModel.buscarOrdenesPorClienteId(id);
        } else if (tipo === 'PROVEEDOR') {
            ordenes = await pagosModel.buscarOrdenesPorProveedorId(id);
        } else if (tipo === 'ADMIN') {
            ordenes = await pagosModel.buscarTodasLasOrdenes();
        } else {
            return res.status(403).json({ message: 'Rol de usuario no autorizado.' });
        }

        res.json(ordenes);

    } catch (error) {
        res.status(500).json({ message: 'Error al obtener las órdenes de pago.', error: error.message });
    }
});

/**
 * POST /pagos/ordenes/:id/transacciones -> Registra un pago para una orden.
 */
router.post('/pagarOrden/:id/transacciones', async (req, res) => {
    // 1. Verificación de Rol
    if (req.usuario.tipo !== 'CLIENTE') {
        return res.status(403).json({ message: 'Acceso denegado. Solo los clientes pueden realizar pagos.' });
    }

    const connection = await pool.getConnection(); // Obtenemos una conexión para la transacción
    try {
        const { id: ordenId } = req.params;
        const { monto, metodo_pago, id_referencia_externa } = req.body;
        const clienteId = req.usuario.id;

        // 2. Validar datos de entrada
        if (!monto || !metodo_pago) {
            return res.status(400).json({ message: 'Faltan datos: se requiere monto y metodo_pago.' });
        }

        // 3. Obtener la orden y verificar permisos y estado
        const orden = await pagosModel.buscarOrdenPorId(ordenId);
        if (!orden) {
            return res.status(404).json({ message: 'La orden de pago no existe.' });
        }
        if (orden.cliente_id !== clienteId) {
            return res.status(403).json({ message: 'No tienes permiso para pagar esta orden.' });
        }
        if (orden.estado !== 'PENDIENTE') {
            return res.status(400).json({ message: `Esta orden ya está en estado '${orden.estado}'.` });
        }
        if (monto > orden.saldo_pendiente) {
            return res.status(400).json({ message: 'El monto del pago no puede ser mayor que el saldo pendiente.' });
        }

        const transaccionesPrevias = await pagosModel.buscarTransaccionesPorOrdenId(ordenId);
        const esPrimerPago = transaccionesPrevias.length === 0;

        // 4. Iniciar la transacción de la base de datos
        await connection.beginTransaction();

        // 5. Llamar a la función del modelo que ejecuta las operaciones
        await pagosModel.registrarTransaccion({ monto, metodo_pago, id_referencia_externa }, ordenId, connection);

        // 6. Si todo fue bien, confirmar la transacción
        await connection.commit();

        // --- INICIO DE LA MODIFICACIÓN ---
        // 7. Verificar si el pago completó la orden para actualizar el contrato
        const ordenActualizada = await pagosModel.buscarOrdenPorId(ordenId);
        if (ordenActualizada && ordenActualizada.saldo_pendiente <= 0) {
            try {
                // El pago ha sido completado, se procede a actualizar el contrato
                await axios.patch(`${CONTRATOS_API_URL}/actualizarContrato/${orden.contrato_id}/estado`, {
                    estado: 'TERMINADO'
                }, {
                    headers: { 'Authorization': `Bearer ${req.token}` }
                });
                console.log(`Contrato ${orden.contrato_id} marcado como TERMINADO exitosamente.`);
            
            } catch (axiosError) {
                // Manejo de errores si falla la comunicación con el microservicio de contratos
                console.error(`Error al intentar actualizar el estado del contrato ${orden.contrato_id}:`, axiosError.message);
                // A pesar del error de comunicación, la transacción de pago ya fue exitosa.
                // Se podría implementar un mecanismo de reintento o registrar el fallo para una acción manual.
            }
        }
        // --- FIN DE LA MODIFICACIÓN ---

         // --- INICIO DE LA NUEVA LÓGICA DE ORQUESTACIÓN ---
        if (esPrimerPago) {
            try {
                // 1. Buscamos los datos del cliente en el servicio de Usuarios
                const resUsuario = await axios.get(`${USUARIOS_API_URL}/buscarUsuario/${clienteId}`, {
                    headers: { 'Authorization': `Bearer ${req.token}` }
                });
                const datosCliente = resUsuario.data;

                // 2. Preparamos los datos para el servicio de Entregas
                const datosEntrega = {
                    contrato_id: orden.contrato_id,
                    orden_de_pago_id: orden.id,
                    cliente_id: orden.cliente_id,
                    proveedor_id: orden.proveedor_id,
                    direccion_entrega: datosCliente.direccion, // Dato obtenido de Usuarios
                    telefono_contacto: datosCliente.telefono    // Dato obtenido de Usuarios
                };
                
                // 3. Llamamos al servicio de Entregas para crear el registro
                await axios.post(`${ENTREGAS_API_URL}/`, datosEntrega, {
                    headers: { 'Authorization': `Bearer ${req.token}` }
                });

                return res.status(201).json({ message: 'Transacción registrada y entrega programada exitosamente.' });

            } catch (orchestrationError) {
                // Si la transacción se guardó pero la entrega falló, lo informamos.
                console.error("Error en orquestación post-pago:", orchestrationError.message);
                return res.status(207).json({ 
                    message: 'Transacción registrada, pero hubo un problema al crear la entrega.',
                    error: orchestrationError.message
                });
            }
        }
        // --- FIN DE LA NUEVA LÓGICA ---

        res.status(201).json({ message: 'Transacción registrada exitosamente.' });

    } catch (error) {
        // 8. Si algo falla, revertir la transacción
        await connection.rollback();
        res.status(500).json({ message: 'Error en el servidor al registrar la transacción.', error: error.message });
    } finally {
        // 8. Pase lo que pase, liberar la conexión
        connection.release();
    }
});

/**
 * [ADMIN] PATCH /pagos/ordenes/:id/cancelar -> Cambia el estado de una orden a CANCELADO.
 */
router.patch('/ordenes/:id/cancelar', async (req, res) => {
    // 1. Verificación de Rol
    if (req.usuario.tipo !== 'ADMIN') {
        return res.status(403).json({ message: 'Acceso denegado. Solo un administrador puede cancelar órdenes.' });
    }

    try {
        const { id: ordenId } = req.params;

        // 2. Obtener la orden para verificar su estado actual
        const orden = await pagosModel.buscarOrdenPorId(ordenId);
        if (!orden) {
            return res.status(404).json({ message: 'La orden de pago no existe.' });
        }

        // 3. Lógica de negocio: Solo se pueden cancelar órdenes pendientes
        if (orden.estado !== 'PENDIENTE') {
            return res.status(409).json({ // 409 Conflict es un buen código para "no se puede hacer por el estado actual del recurso"
                message: `No se puede cancelar una orden que ya está en estado '${orden.estado}'.`
            });
        }
        
        // 4. Llamar al modelo para actualizar el estado
        await pagosModel.actualizarEstadoOrden(ordenId, 'CANCELADO');

        // 5. Notificar al microservicio de Contratos que el contrato asociado también debe ser cancelado
        try {
            await axios.patch(`${CONTRATOS_API_URL}/actualizarContrato/${orden.contrato_id}/estado`, {
                estado: 'TERMINADO'
            }, {
                headers: { 'Authorization': `Bearer ${req.token}` }
            });
            console.log(`Contrato ${orden.contrato_id} cancelado exitosamente.`);
        } catch (axiosError) {
            // Si la comunicación falla, es importante registrar el error.
            // Dependiendo de la criticidad, se podrían implementar reintentos o un sistema de compensación.
            console.error(`Error al intentar cancelar el contrato ${orden.contrato_id}:`, axiosError.message);
            // Opcionalmente, podrías querer informar al cliente que la cancelación del contrato falló,
            // aunque la orden de pago sí se canceló.
        }

        // 6. Notificar al microservicio de Entregas para cancelar la entrega asociada
        try {
            await axios.patch(`${ENTREGAS_API_URL}/cancelar/orden/${ordenId}`, {}, {
                headers: { 'Authorization': `Bearer ${req.token}` }
            });
            console.log(`Notificación de cancelación para la entrega asociada a la orden ${ordenId} enviada.`);
        } catch (axiosError) {
            console.error(`Error al intentar cancelar la entrega asociada a la orden ${ordenId}:`, axiosError.message);
        }

        res.json({ message: 'La orden de pago ha sido cancelada exitosamente y se ha notificado la cancelación del contrato y la entrega.' });

    } catch (error) {
        res.status(500).json({ message: 'Error en el servidor al cancelar la orden.', error: error.message });
    }
});

/**
 * GET /pagos/ordenes/:id -> Obtiene los detalles de una orden y su lista de transacciones.
 */
router.get('/transaccionesPorOrden/:id', async (req, res) => {
    try {
        const { id: ordenId } = req.params;
        const { id: usuarioId, tipo: usuarioTipo } = req.usuario;

        // 1. Obtener los detalles de la orden de pago
        const orden = await pagosModel.buscarOrdenPorId(ordenId);
        if (!orden) {
            return res.status(404).json({ message: 'La orden de pago no existe.' });
        }

        // 2. Verificación de permisos: Solo el cliente, proveedor o un admin pueden verla.
        if (
            usuarioTipo !== 'ADMIN' &&
            orden.cliente_id !== usuarioId &&
            orden.proveedor_id !== usuarioId
        ) {
            return res.status(403).json({ message: 'No tienes permiso para ver esta orden de pago.' });
        }

        // 3. Obtener todas las transacciones asociadas a esta orden
        const transacciones = await pagosModel.buscarTransaccionesPorOrdenId(ordenId);

        // 4. Combinar la información en una sola respuesta
        const resultado = {
            ...orden, // Copia todos los campos de la orden
            transacciones: transacciones // Y añade la lista de transacciones
        };

        res.json(resultado);

    } catch (error) {
        res.status(500).json({ message: 'Error al obtener los detalles de la orden de pago.', error: error.message });
    }
});

module.exports = router;