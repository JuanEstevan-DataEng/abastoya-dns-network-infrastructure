const express = require('express');
const router = express.Router();
const entregasModel = require('../models/entregasModel');
const authMiddleware = require('../middleware/authMiddleware');
const axios = require('axios');

const PAGOS_API_URL = 'http://localhost:3004/pagos';

router.use(authMiddleware);

// --- CREAR ENTREGA (Llamado por el servicio de Pagos) ---
router.post('/', async (req, res) => {
    try {
        const datosEntrega = req.body;

        // Validar que no exista ya una entrega para este contrato
        const existente = await entregasModel.buscarPorContratoId(datosEntrega.contrato_id);
        if (existente) {
            return res.status(409).json({ message: 'Ya existe una entrega programada para este contrato.' });
        }

        const nuevaEntrega = await entregasModel.crearEntrega(datosEntrega);
        res.status(201).json({ message: 'Entrega creada exitosamente', entrega_id: nuevaEntrega.id });

    } catch (error) {
        res.status(500).json({ message: 'Error al crear la entrega.', error: error.message });
    }
});

// --- CONSULTAR ENTREGAS (Sensible al rol) ---
router.get('/', async (req, res) => {
    try {
        const { id, tipo } = req.usuario;
        let entregas = [];

        if (tipo === 'CLIENTE') {
            entregas = await entregasModel.buscarEntregasPorClienteId(id);
        } else if (tipo === 'PROVEEDOR') {
            entregas = await entregasModel.buscarEntregasPorProveedorId(id);
        } else if (tipo === 'ADMIN') {
            entregas = await entregasModel.buscarTodasLasEntregas();
        }

        res.json(entregas);

    } catch (error) {
        res.status(500).json({ message: 'Error al obtener las entregas.', error: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { id: usuarioId, tipo: usuarioTipo } = req.usuario;

        const entrega = await entregasModel.buscarEntregaPorId(id);
        if (!entrega) {
            return res.status(404).json({ message: 'Entrega no encontrada.' });
        }

        // Autorización: solo los involucrados o un admin pueden verla.
        if (usuarioTipo !== 'ADMIN' && entrega.cliente_id !== usuarioId && entrega.proveedor_id !== usuarioId) {
            return res.status(403).json({ message: 'No tienes permiso para ver esta entrega.' });
        }

        res.json(entrega);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener la entrega.', error: error.message });
    }
});


// PATCH /entregas/:id/estado -> Actualiza el estado de una entrega
router.patch('/:id/estado', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado: nuevoEstado } = req.body;
        const { id: usuarioId, tipo: usuarioTipo } = req.usuario;
        const authHeader = req.headers.authorization;

        // 1. Verificación de permisos (solo proveedores y admins)
        if (usuarioTipo !== 'PROVEEDOR' && usuarioTipo !== 'ADMIN') {
            return res.status(403).json({ message: 'No tienes permiso para actualizar el estado de la entrega.' });
        }
        
        // 2. Obtener el estado actual de la entrega
        const entrega = await entregasModel.buscarEntregaPorId(id);
        if (!entrega) {
            return res.status(404).json({ message: 'Entrega no encontrada.' });
        }

        // Un proveedor solo puede modificar sus propias entregas.
        if (usuarioTipo === 'PROVEEDOR' && entrega.proveedor_id !== usuarioId) {
            return res.status(403).json({ message: 'No puedes modificar una entrega que no te pertenece.' });
        }

        // No se puede cambiar el estado de una entrega en estado final.
        if (['ENTREGADO', 'CANCELADO', 'INCIDENCIA'].includes(entrega.estado)) {
            return res.status(409).json({ message: `La entrega ya está en un estado final (${entrega.estado}) y no puede ser modificada.` });
        }

        // 4. Lógica de Transición de Estados
        // Caso especial para ADMIN reportando incidencia
        if (usuarioTipo === 'ADMIN' && nuevoEstado === 'INCIDENCIA') {
            // El admin puede reportar una incidencia en cualquier estado no final.
            // Se salta la lógica de transición normal y la verificación de pago.
        } else {
            // Lógica de transición para proveedores
            const estadosValidos = {
                'PENDIENTE': ['EN_PREPARACION', 'CANCELADO'],
                'EN_PREPARACION': ['EN_RUTA', 'CANCELADO'],
                'EN_RUTA': ['ENTREGADO', 'CANCELADO'],
            };

            const transicionesPermitidas = estadosValidos[entrega.estado] || [];
            if (!transicionesPermitidas.includes(nuevoEstado)) {
                return res.status(400).json({ 
                    message: `Transición de estado no válida: de '${entrega.estado}' a '${nuevoEstado}'.` 
                });
            }

            // 5. Verificación del estado del pago antes de procesar (solo para flujo normal)
            if (nuevoEstado !== 'CANCELADO') {
                try {
                    const url = `${PAGOS_API_URL}/transaccionesPorOrden/${entrega.orden_de_pago_id}`;
                    const resPago = await axios.get(url, {
                        headers: { 'Authorization': authHeader }
                    });

                    if (resPago.data.estado !== 'PAGADO') {
                        return res.status(402).json({ message: 'La orden de pago asociada aún no ha sido completada. No se puede actualizar la entrega.' });
                    }
                } catch (error) {
                    console.error("Error al verificar el estado del pago:", error.message);
                    return res.status(500).json({ message: 'No se pudo verificar el estado de la orden de pago.' });
                }
            }
        }

        // 6. Actualización en la base de datos
        const datosParaActualizar = { estado: nuevoEstado };
        if (nuevoEstado === 'ENTREGADO') {
            datosParaActualizar.fecha_entrega_real = new Date();
        }

        await entregasModel.actualizarEntrega(id, datosParaActualizar);
        res.json({ message: `Estado de la entrega actualizado a: ${nuevoEstado}` });

    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar el estado de la entrega.', error: error.message });
    }
});

// --- REPROGRAMAR ENTREGA (Solo Proveedor desde Incidencia) ---
router.patch('/:id/reprogramar', async (req, res) => {
    try {
        const { id } = req.params;
        const { id: usuarioId, tipo: usuarioTipo } = req.usuario;

        // 1. Solo los proveedores pueden reprogramar
        if (usuarioTipo !== 'PROVEEDOR') {
            return res.status(403).json({ message: 'Solo los proveedores pueden reprogramar una entrega.' });
        }

        // 2. Obtener la entrega
        const entrega = await entregasModel.buscarEntregaPorId(id);
        if (!entrega) {
            return res.status(404).json({ message: 'Entrega no encontrada.' });
        }

        // 3. Validar que el proveedor es dueño de la entrega
        if (entrega.proveedor_id !== usuarioId) {
            return res.status(403).json({ message: 'No tienes permiso para reprogramar esta entrega.' });
        }

        // 4. Validar que la entrega esté en estado de INCIDENCIA
        if (entrega.estado !== 'INCIDENCIA') {
            return res.status(409).json({ message: `Solo se puede reprogramar una entrega en estado de INCIDENCIA. Estado actual: ${entrega.estado}.` });
        }

        // 5. Calcular nueva fecha y preparar datos para actualizar
        const nuevaFechaEstimada = new Date(entrega.fecha_estimada_entrega);
        nuevaFechaEstimada.setDate(nuevaFechaEstimada.getDate() + 1);

        const datosParaActualizar = {
            estado: 'EN_PREPARACION',
            fecha_estimada_entrega: nuevaFechaEstimada
        };

        // 6. Actualizar en la base de datos
        await entregasModel.actualizarEntrega(id, datosParaActualizar);

        res.json({ message: 'La entrega ha sido reprogramada exitosamente. Nuevo estado: EN_PREPARACION.' });

    } catch (error) {
        res.status(500).json({ message: 'Error al reprogramar la entrega.', error: error.message });
    }
});


// --- CANCELAR ENTREGA (Llamado por el servicio de Pagos) ---
router.patch('/cancelar/orden/:ordenId', async (req, res) => {
    try {
        const { ordenId } = req.params;

        // 1. Buscar la entrega por el ID de la orden de pago
        const entrega = await entregasModel.buscarPorOrdenDePagoId(ordenId);
        if (!entrega) {
            // Si no se encuentra, puede que no se haya creado aún, lo cual no es un error fatal.
            return res.status(200).json({ message: 'No se encontró una entrega para cancelar (puede que aún no se haya creado).' });
        }

        // 2. Verificar si la entrega ya está en un estado final
        if (entrega.estado === 'ENTREGADO' || entrega.estado === 'CANCELADO') {
            return res.status(409).json({ message: `La entrega ya está en estado '${entrega.estado}' y no puede ser cancelada.` });
        }

        // 3. Actualizar el estado a CANCELADO
        await entregasModel.actualizarEntrega(entrega.id, { estado: 'CANCELADO' });

        res.json({ message: 'La entrega asociada ha sido cancelada exitosamente.' });

    } catch (error) {
        res.status(500).json({ message: 'Error al cancelar la entrega.', error: error.message });
    }
});

module.exports = router;