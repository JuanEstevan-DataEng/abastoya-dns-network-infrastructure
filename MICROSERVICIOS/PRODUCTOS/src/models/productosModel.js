// /productos-service/src/models/productosModel.js

const mysql = require('mysql2/promise');

// Configura tu pool de conexiones.
// ¡Recuerda cambiar estos valores por los de tu base de datos!
const pool = mysql.createPool({
    host: '172.17.0.1',
    user: 'root',
    password: process.env.DB_PASSWORD || 'changeme', // Cambia tu contraseña
    database: 'productos'
});

/**
 * CONSULTAR: Busca un producto del catálogo maestro por su ID.
 * Es una función auxiliar crucial para la lógica de creación.
 * @param {number} id - El ID del producto en producto_coroabasto.
 * @returns {object|null} El objeto del producto base o null si no se encuentra.
 */
async function buscarProductoCoroabastoPorId(id) {
    const sql = 'SELECT * FROM producto_coroabasto WHERE id = ?';
    const [rows] = await pool.query(sql, [id]);
    return rows[0] || null;
}

/**
 * NUEVO: Busca una oferta de producto de un proveedor por su ID.
 * @param {number} id - El ID del producto en la tabla `producto`.
 * @returns {object|null} El objeto de la oferta o null si no se encuentra.
 */
async function buscarProductoProveedorPorId(id) {
    const sql = 'SELECT * FROM producto WHERE id = ?';
    const [rows] = await pool.query(sql, [id]);
    return rows[0] || null;
}

/**
 * NUEVO: Actualiza un producto del catálogo maestro (Admin).
 * @param {number} id - El ID del producto a actualizar.
 * @param {object} datos - Objeto con los campos a modificar.
 * @returns {number} El número de filas afectadas.
 */
async function actualizarProductoCoroabasto(id, datos) {
    const campos = Object.keys(datos);
    const valores = Object.values(datos);

    if (campos.length === 0) return 0;

    const setClause = campos.map(campo => `${campo} = ?`).join(', ');
    const sql = `UPDATE producto_coroabasto SET ${setClause} WHERE id = ?`;

    const [result] = await pool.query(sql, [...valores, id]);
    return result.affectedRows;
}

/**
 * NUEVO: Pone en revisión todos los productos de proveedores asociados a un producto base.
 * @param {number} producto_coroabasto_id - El ID del producto base que fue modificado.
 * @returns {number} El número de filas afectadas.
 */
async function marcarProductosParaRevision(producto_coroabasto_id) {
    const sql = "UPDATE producto SET estado = 'REQUIERE_REVISION' WHERE producto_coroabasto_id = ?";
    const [result] = await pool.query(sql, [producto_coroabasto_id]);
    return result.affectedRows;
}

/**
 * NUEVO: Actualiza la oferta de un producto de un proveedor.
 * @param {number} id - El ID de la oferta a actualizar.
 * @param {object} datos - Objeto con los campos a modificar (ej. precio, estado).
 * @returns {number} El número de filas afectadas.
 */
async function actualizarProductoProveedor(id, datos) {
    const campos = Object.keys(datos);
    const valores = Object.values(datos);

    if (campos.length === 0) return 0;

    const setClause = campos.map(campo => `${campo} = ?`).join(', ');
    const sql = `UPDATE producto SET ${setClause} WHERE id = ?`;

    const [result] = await pool.query(sql, [...valores, id]);
    return result.affectedRows;
}

/**
 * CONSULTAR: Trae todos los productos del catálogo maestro.
 * @returns {Array<object>} Un array con todos los productos de Coroabasto.
 */
async function traerTodosCoroabasto() {
    const sql = 'SELECT * FROM producto_coroabasto ORDER BY categoria ASC';
    const [rows] = await pool.query(sql);
    return rows;
}

/**
 * CONSULTAR: Trae todos los productos de proveedores que están ACTIVOS.
 * @returns {Array<object>} Un array con las ofertas de productos activas.
 */
async function traerTodosActivos() {
    const sql = `
        SELECT id, nombre, unidad, precio, precio_unitario, proveedor_id 
        FROM producto WHERE estado = 'ACTIVO'
    `;
    const [rows] = await pool.query(sql);
    return rows;
}




/**
 * CREAR: Inserta un nuevo producto en el catálogo maestro (Admin).
 * @param {object} producto - Objeto con los datos del producto base.
 * @returns {object} Objeto con el ID del nuevo producto insertado.
 */
async function crearProductoCoroabasto(producto) {
    const sql = `
        INSERT INTO producto_coroabasto 
        (nombre, presentacion, cantidad, unidad_de_medida, precio_con_calidad_extra, 
        precio_con_calidad_primera, precio_por_unidad, categoria) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await pool.query(sql, [
        producto.nombre, producto.presentacion, producto.cantidad, producto.unidad_de_medida,
        producto.precio_con_calidad_extra, producto.precio_con_calidad_primera,
        producto.precio_por_unidad, producto.categoria
    ]);
    return { id: result.insertId };
}

/**
 * CREAR: Inserta una nueva oferta de producto de un proveedor.
 * @param {object} producto - Objeto con los datos de la oferta del proveedor.
 * @returns {object} Objeto con el ID de la nueva oferta insertada.
 */
async function crearProductoProveedor(producto) {
    const sql = `
        INSERT INTO producto 
        (nombre, unidad, precio, precio_unitario, proveedor_id, producto_coroabasto_id) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    const [result] = await pool.query(sql, [
        producto.nombre, producto.unidad, producto.precio,
        producto.precio_unitario, producto.proveedor_id, producto.producto_coroabasto_id
    ]);
    return { id: result.insertId };
}

/**
 * NUEVO: Trae TODOS los productos de un proveedor específico, sin importar su estado.
 * @param {number} proveedorId - El ID del proveedor.
 * @returns {Array<object>} Un array con todos los productos del proveedor.
 */
async function traerProductosPorProveedorId(proveedorId) {
    const sql = 'SELECT * FROM producto WHERE proveedor_id = ? ORDER BY nombre ASC';
    const [rows] = await pool.query(sql, [proveedorId]);
    return rows;
}

module.exports = {
    buscarProductoCoroabastoPorId,
    buscarProductoProveedorPorId,
    traerTodosCoroabasto,
    traerTodosActivos,
    crearProductoCoroabasto,
    crearProductoProveedor,
    actualizarProductoCoroabasto, 
    marcarProductosParaRevision,  
    actualizarProductoProveedor,
    traerProductosPorProveedorId
};