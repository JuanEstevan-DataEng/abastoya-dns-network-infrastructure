const express = require('express');
const router = express.Router();
const axios = require('axios');
const contratosModel = require('../models/contratosModel');
const authMiddleware = require('../middleware/authMiddleware');

// Asumimos las URLs base de los otros microservicios.
// ¡Asegúrate de que los puertos sean los correctos!
const USUARIOS_API_URL = 'http://localhost:3001/usuarios';
const PRODUCTOS_API_URL = 'http://localhost:3002/productos';
const PAGOS_API_URL = 'http://localhost:3004/pagos';

router.use(authMiddleware);
// ----------------------------------------------------------------
// 1. OBTENER TODOS LOS CONTRATOS
// ----------------------------------------------------------------
router.get('/traerTodosLosContratos', async (req, res) => {
        try {
        // 1. Obtenemos el tipo y el ID del usuario directamente del token
        const { id, tipo } = req.usuario;

        let contratos = [];

        // 2. Decidimos qué función del modelo llamar según el rol del usuario
        if (tipo === 'ADMIN') {
            // Si es Admin, trae absolutamente todo
            contratos = await contratosModel.traerContratos();
        } else if (tipo === 'CLIENTE') {
            // Si es Cliente, filtra por su propio ID de cliente
            contratos = await contratosModel.traerContratosPorClienteId(id);
        } else if (tipo === 'PROVEEDOR') {
            // Si es Proveedor, filtra por su propio ID de proveedor
            contratos = await contratosModel.traerContratosPorProveedorId(id);
        } else {
            // Si por alguna razón el tipo de usuario no es válido, no devolvemos nada
            return res.status(403).json({ message: 'Tipo de usuario no autorizado para ver contratos.' });
        }
        
        // 3. Enviamos el resultado correspondiente
        res.json(contratos);

    } catch (error) {
        res.status(500).json({ message: 'Error al obtener los contratos', error: error.message });
    }
});

// ----------------------------------------------------------------
// 2. OBTENER UN CONTRATO POR SU ID
// ----------------------------------------------------------------
router.get('/traerContratoPorId/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const contrato = await contratosModel.traerContratoPorId(id);

        // Si el modelo devuelve null, significa que no lo encontró.
        if (!contrato) {
            return res.status(404).json({ message: 'Contrato no encontrado.' });
        }

        res.json(contrato);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener el contrato', error: error.message });
    }
});

// ----------------------------------------------------------------
// 3. CREAR UN NUEVO CONTRATO
// ----------------------------------------------------------------
router.post('/crearContrato', async (req, res) => {
    try {
         // a. El ID del cliente AHORA VIENE DEL TOKEN, no del body.
        // req.usuario es añadido por nuestro authMiddleware.
        const cliente_id = req.usuario.id; 
        const tipo_usuario = req.usuario.tipo;

        const { proveedor_id, productos } = req.body;

        // b. Validación inicial de que los datos necesarios existen.
        if (!cliente_id || !proveedor_id || !productos || productos.length === 0) {
            return res.status(400).json({ message: 'Faltan datos requeridos (cliente_id, proveedor_id, productos).' });
        }

        // c. Verificamos que los usuarios (cliente y proveedor) existan.
        // Usamos Promise.all para hacer las dos llamadas en paralelo y ser más eficientes.
        await axios.get(`${USUARIOS_API_URL}/buscarUsuario/${proveedor_id}`, {
            headers: { 'Authorization': `Bearer ${req.token}` }
        });
        if (tipo_usuario !== 'CLIENTE') {
            return res.status(403).json({ message: 'Acceso denegado. Solo los usuarios de tipo CLIENTE pueden crear contratos.' });
        }
        // Si alguno de los usuarios no existe, axios arrojará un error y el catch lo atrapará.
        
        let totalContrato = 0;
        const productosDetallados = [];

        // d. Procesamos cada producto para obtener sus detalles y calcular totales.
        for (const item of productos) {
            // Hacemos una llamada al microservicio de Productos por cada item.
            const responseProducto = await axios.get(`${PRODUCTOS_API_URL}/buscarPorId/${item.producto_id}`, {
                headers: { 'Authorization': `Bearer ${req.token}` }
            });
            const detalleProducto = responseProducto.data;

            // ¡Validación clave! Verificamos que el producto pertenezca al proveedor del contrato.
            if (detalleProducto.proveedor_id !== proveedor_id) {
                throw new Error(`El producto '${detalleProducto.nombre}' (ID: ${item.producto_id}) no pertenece al proveedor especificado.`);
            }

            // Calculamos el subtotal para este item.
            const subTotal = detalleProducto.precio_unitario * item.cantidad;
            totalContrato += subTotal;

            // Construimos el objeto completo del producto que guardaremos en nuestra BD.
            productosDetallados.push({
                producto_id: item.producto_id,
                nombre_producto: detalleProducto.nombre,
                unidad: detalleProducto.unidad,
                cantidad: item.cantidad,
                precio_unitario: detalleProducto.precio_unitario,
                sub_total: subTotal
            });
        }
        
        // e. Preparamos el objeto final para enviar al modelo.
        const contrato = {
            cliente_id,
            proveedor_id,
            total: totalContrato,
            productos: productosDetallados
        };

        // f. Llamamos al modelo para que guarde todo en la base de datos.
        const nuevoContrato = await contratosModel.crearContrato(contrato);

        res.status(201).json({ message: 'Contrato creado exitosamente', contrato_id: nuevoContrato.id });

    } catch (error) {
        // g. Manejo centralizado de errores.
        if (error.response) {
            // Si el error viene de axios (ej: un usuario o producto no encontrado)
            return res.status(404).json({ message: 'No se pudo encontrar un usuario o producto especificado.', details: error.message });
        }
        res.status(500).json({ message: 'Error al crear el contrato', error: error.message });
    }
});

router.patch('/actualizarContrato/:id/estado', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body; // Obtenemos el nuevo estado del cuerpo de la petición

        // a. Validación inicial: ¿Nos enviaron un estado?
        if (!estado) {
            return res.status(400).json({ message: 'Falta el campo "estado" en el cuerpo de la petición.' });
        }

        // b. Llamamos a la nueva función del modelo.
        // La validación del ENUM ya la hace el modelo, así que aquí no es necesario repetirla.
        const filasAfectadas = await contratosModel.actualizarEstadoContrato(id, estado);

        // c. Verificamos si la actualización tuvo éxito.
        if (filasAfectadas === 0) {
            // Si el modelo devuelve 0, significa que no encontró el contrato.
            return res.status(404).json({ message: 'Contrato no encontrado.' });
        }

         // --- INICIO DE LA NUEVA LÓGICA ---
        // Si el estado es APROBADO, creamos la orden de pago.
        if (estado === 'APROBADO') {
            // 1. Obtenemos los detalles completos del contrato que acabamos de aprobar.
            const contratoAprobado = await contratosModel.traerContratoPorId(id);

            // 2. Preparamos los datos para el servicio de Pagos.
            const datosOrdenPago = {
                contrato_id: contratoAprobado.id,
                cliente_id: contratoAprobado.cliente_id,
                proveedor_id: contratoAprobado.proveedor_id,
                total: contratoAprobado.total
            };

            // 3. Llamamos al microservicio de Pagos para crear la orden.
            // Le pasamos el token para que Pagos pueda autenticar la petición.
            await axios.post(`${PAGOS_API_URL}/crearOrden`, datosOrdenPago, {
                headers: { 'Authorization': `Bearer ${req.token}` }
            });
            
            // Enviamos una respuesta informando de ambas acciones.
            return res.json({ message: 'Estado actualizado y orden de pago creada exitosamente.' });
        }
        // d. Si todo fue bien, devolvemos una respuesta de éxito.
        res.json({ message: 'Estado del contrato actualizado exitosamente.' });

    } catch (error) {
        // e. Manejo de errores.
        // Si el modelo lanzó un error (ej: estado no válido), lo atrapamos aquí.
        res.status(500).json({ message: 'Error al actualizar el estado del contrato', error: error.message });
    }
});

router.get('/contratosPorProveedor/:proveedorId', async (req, res) => {
    try {
        // a. Obtenemos el ID del proveedor de los parámetros de la URL.
        const { proveedorId } = req.params;

        // b. Llamamos a la nueva función del modelo.
        const contratos = await contratosModel.traerContratosPorProveedorId(proveedorId);

        // c. Devolvemos los contratos encontrados.
        // Si el modelo no encontró nada, devolverá un array vacío, lo cual es
        // una respuesta correcta (200 OK con una lista vacía).
        res.json(contratos);

    } catch (error) {
        // d. Manejo de errores.
        res.status(500).json({ message: 'Error al obtener los contratos del proveedor', error: error.message });
    }
});

// ----------------------------------------------------------------
// 6. OBTENER CONTRATOS POR ID DE CLIENTE
// ----------------------------------------------------------------
router.get('/contratosPorCliente/:clienteId', async (req, res) => {
    try {
        const { clienteId } = req.params;

        // Llamamos a la función correspondiente del modelo
        const contratos = await contratosModel.traerContratosPorClienteId(clienteId);

        // Devolvemos el resultado
        res.json(contratos);

    } catch (error) {
        res.status(500).json({ message: 'Error al obtener los contratos del cliente', error: error.message });
    }
});

module.exports = router;