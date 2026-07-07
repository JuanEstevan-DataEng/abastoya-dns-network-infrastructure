// /productos-service/src/controllers/productosController.js

const express = require('express');
const router = express.Router();
const productosModel = require('../models/productosModel');
const authMiddleware = require('../middleware/authMiddleware');

// Aplicamos el middleware de autenticación a TODAS las rutas de este controlador.
router.use(authMiddleware);

// --- Rutas de CONSULTA ---

// [PÚBLICO] GET /productos -> Trae todas las ofertas ACTIVAS de proveedores.
router.get('/traerTodos', async (req, res) => {
    try {   
        const productos = await productosModel.traerTodosActivos();
        res.json(productos);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener los productos', error: error.message });
    }
});

// [ADMIN/PROVEEDOR] GET /productos/coroabasto -> Trae el catálogo maestro.
router.get('/traerProductosCoroabasto', async (req, res) => {
    try {
        // Esta lista es necesaria tanto para Admins como para Proveedores.
        const productosBase = await productosModel.traerTodosCoroabasto();
        res.json(productosBase);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener el catálogo de productos', error: error.message });
    }
});

// --- Rutas de CREACIÓN ---

// [PROVEEDOR] POST /productos -> Crea una nueva oferta de producto.
router.post('/proveedorCrearProducto', async (req, res) => {
    // 1. Verificación de Rol
    if (req.usuario.tipo !== 'PROVEEDOR') {
        return res.status(403).json({ message: 'Acceso denegado. Solo los proveedores pueden crear productos.' });
    }

    try {
        const { producto_coroabasto_id, precio } = req.body;
        const proveedor_id = req.usuario.id;

        // 2. Validación de datos de entrada
        if (!producto_coroabasto_id || precio === undefined) {
            return res.status(400).json({ message: 'Faltan datos: se requiere producto_coroabasto_id y precio.' });
        }

        // 3. Obtener el producto base para validación
        const productoBase = await productosModel.buscarProductoCoroabastoPorId(producto_coroabasto_id);
        if (!productoBase) {
            return res.status(404).json({ message: 'El producto base especificado no existe.' });
        }

        // 4. Lógica de negocio: Validar el rango de precios
        const precioMinimo = productoBase.precio_con_calidad_primera * 0.85; // -15%
        const precioMaximo = productoBase.precio_con_calidad_extra * 1.15;   // +15%

        if (precio < precioMinimo || precio > precioMaximo) {
            return res.status(400).json({
                message: 'El precio está fuera del rango permitido.',
                rango: {
                    minimo: precioMinimo.toFixed(2),
                    maximo: precioMaximo.toFixed(2)
                }
            });
        }

        // 5. Lógica de negocio: Calcular el precio unitario
        const precio_unitario = precio / productoBase.cantidad;

        // 6. Construir el objeto para el modelo
        const nuevoProducto = {
            nombre: productoBase.nombre,
            unidad: productoBase.unidad_de_medida,
            precio: precio,
            precio_unitario: precio_unitario.toFixed(2),
            proveedor_id: proveedor_id,
            producto_coroabasto_id: producto_coroabasto_id
        };

        // 7. Llamar al modelo para crear el producto
        const productoCreado = await productosModel.crearProductoProveedor(nuevoProducto);
        res.status(201).json({ message: 'Producto creado exitosamente.', id: productoCreado.id });

    } catch (error) {
        res.status(500).json({ message: 'Error en el servidor al crear el producto.', error: error.message });
    }
});

// [ADMIN] POST /productos/coroabasto -> Crea un nuevo producto en el catálogo.
router.post('/coroabastoCrearProducto', async (req, res) => {
    // 1. Verificación de Rol
    if (req.usuario.tipo !== 'ADMIN') {
        return res.status(403).json({ message: 'Acceso denegado. Solo los administradores pueden gestionar el catálogo.' });
    }
    
    try {
        // Aquí asumimos que el admin envía todos los datos necesarios en el body.
        const nuevoProductoBase = req.body;
        
        // Se podrían añadir más validaciones aquí...
        
        const productoCreado = await productosModel.crearProductoCoroabasto(nuevoProductoBase);
        res.status(201).json({ message: 'Producto base creado exitosamente.', id: productoCreado.id });

    } catch (error) {
        res.status(500).json({ message: 'Error al crear el producto base.', error: error.message });
    }
});

// BUSCAR POR PRODUCTO POR ID

/**
 * NUEVO: [PÚBLICO] GET /productos/:id -> Trae una oferta específica por su ID.
 */
router.get('/buscarPorId/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const producto = await productosModel.buscarProductoProveedorPorId(id);

        if (!producto) {
            return res.status(404).json({ message: 'Producto no encontrado.' });
        }

        res.json(producto);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener el producto.', error: error.message });
    }
});

/**
 * NUEVO: [ADMIN] PATCH /productos/coroabasto/:id -> Actualiza un producto del catálogo
 * y dispara la revalidación de las ofertas de proveedores.
 */
router.patch('/coroabasto/:id', async (req, res) => {
    if (req.usuario.tipo !== 'ADMIN') {
        return res.status(403).json({ message: 'Acceso denegado. Solo los administradores pueden gestionar el catálogo.' });
    }

    try {
        const { id } = req.params;
        const datosParaActualizar = req.body;

        const filasAfectadas = await productosModel.actualizarProductoCoroabasto(id, datosParaActualizar);

        if (filasAfectadas === 0) {
            return res.status(404).json({ message: 'Producto base no encontrado o sin cambios.' });
        }

        // Lógica de revalidación: Si se actualizó el precio, marcar para revisión.
        if (datosParaActualizar.precio_con_calidad_primera || datosParaActualizar.precio_con_calidad_extra) {
            const revisiones = await productosModel.marcarProductosParaRevision(id);
            return res.json({ message: `Producto base actualizado. ${revisiones} ofertas de proveedores marcadas para revisión.` });
        }

        res.json({ message: 'Producto base actualizado exitosamente.' });

    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar el producto base.', error: error.message });
    }
});

/**
 * NUEVO: [PROVEEDOR] PATCH /productos/:id -> Actualiza la oferta de un producto.
 */
router.patch('/proveedorupdate/:id', async (req, res) => {
    if (req.usuario.tipo !== 'PROVEEDOR') {
        return res.status(403).json({ message: 'Acceso denegado. Solo los proveedores pueden actualizar productos.' });
    }

    try {
        const { id } = req.params; // ID de la oferta del proveedor
        const { precio } = req.body;
        const proveedor_id = req.usuario.id;

        // 1. Verificar que el producto existe y le pertenece al proveedor
        const productoActual = await productosModel.buscarProductoProveedorPorId(id);
        if (!productoActual) {
            return res.status(404).json({ message: 'Producto no encontrado.' });
        }
        if (productoActual.proveedor_id !== proveedor_id) {
            return res.status(403).json({ message: 'No tienes permiso para modificar este producto.' });
        }

        // 2. Si no se envía un precio, no hay nada que validar o hacer.
        if (precio === undefined) {
            return res.status(400).json({ message: 'No se proporcionó un nuevo precio para actualizar.' });
        }

        // 3. Re-validar el nuevo precio con el producto base
        const productoBase = await productosModel.buscarProductoCoroabastoPorId(productoActual.producto_coroabasto_id);
        const precioMinimo = productoBase.precio_con_calidad_primera * 0.85;
        const precioMaximo = productoBase.precio_con_calidad_extra * 1.15;

        if (precio < precioMinimo || precio > precioMaximo) {
            return res.status(400).json({
                message: 'El nuevo precio está fuera del rango permitido.',
                rango: { minimo: precioMinimo.toFixed(2), maximo: precioMaximo.toFixed(2) }
            });
        }
        
        // 4. Preparar datos y actualizar
        const nuevoPrecioUnitario = precio / productoBase.cantidad;
        const datosParaActualizar = {
            precio: precio,
            precio_unitario: nuevoPrecioUnitario.toFixed(2),
            estado: 'ACTIVO' // Se actualiza el precio, se reactiva el producto.
        };

        await productosModel.actualizarProductoProveedor(id, datosParaActualizar);

        res.json({ message: 'Producto actualizado y activado exitosamente.' });

    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar el producto.', error: error.message });
    }
});

/**
 * NUEVO: [PROVEEDOR] GET /productos/mis-productos -> Trae todos los productos
 * del proveedor autenticado, incluyendo los inactivos o en revisión.
 */
router.get('/proveedorMisProductos', async (req, res) => {
    // 1. Verificación de Rol
    if (req.usuario.tipo !== 'PROVEEDOR') {
        return res.status(403).json({ message: 'Acceso denegado. Esta vista es solo para proveedores.' });
    }

    try {
        // 2. Obtener ID del token
        const proveedorId = req.usuario.id;

        // 3. Llamar a la nueva función del modelo
        const misProductos = await productosModel.traerProductosPorProveedorId(proveedorId);

        res.json(misProductos);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener tus productos.', error: error.message });
    }
});

/**
 * NUEVO: [PROVEEDOR] PATCH /productos/:id/estado -> Cambia el estado de un producto
 * entre ACTIVO e INACTIVO.
 */
router.patch('/actualizarMiProducto/:id/estado', async (req, res) => {
    // 1. Verificación de Rol
    if (req.usuario.tipo !== 'PROVEEDOR') {
        return res.status(403).json({ message: 'Acceso denegado. Solo los proveedores pueden cambiar el estado de los productos.' });
    }

    try {
        const { id } = req.params;
        const { estado: nuevoEstado } = req.body;
        const proveedor_id = req.usuario.id;

        // 2. Validar que el estado enviado sea 'ACTIVO' o 'INACTIVO'
        if (nuevoEstado !== 'ACTIVO' && nuevoEstado !== 'INACTIVO') {
            return res.status(400).json({ message: "Estado no válido. Solo se permite 'ACTIVO' o 'INACTIVO'." });
        }
        
        // 3. Obtener el producto para verificar propiedad y estado actual
        const productoActual = await productosModel.buscarProductoProveedorPorId(id);
        if (!productoActual) {
            return res.status(404).json({ message: 'Producto no encontrado.' });
        }
        if (productoActual.proveedor_id !== proveedor_id) {
            return res.status(403).json({ message: 'No tienes permiso para modificar este producto.' });
        }

        // 4. Lógica de negocio: Prohibir el cambio si requiere revisión
        if (productoActual.estado === 'REQUIERE_REVISION') {
            return res.status(403).json({ message: 'Este producto requiere revisión de precio. No se puede cambiar su estado hasta que el precio sea actualizado.' });
        }

        // 5. Actualizar el estado en la base de datos
        await productosModel.actualizarProductoProveedor(id, { estado: nuevoEstado });

        res.json({ message: `Producto actualizado al estado: ${nuevoEstado}` });

    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar el estado del producto.', error: error.message });
    }
});

module.exports = router;
