// /pagos-service/src/models/pagosModel.js

const mysql = require('mysql2/promise');

// Configura el pool de conexiones para la BD 'pagos'.
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: process.env.DB_PASSWORD || 'changeme', // Cambia tu contraseña
    database: 'pagos'
});

/**
 * Busca una orden de pago por el ID del contrato asociado.
 * @param {number} contratoId - El ID del contrato.
 * @returns {object|null} La orden de pago si existe, o null.
 */
async function buscarOrdenPorContratoId(contratoId) {
    const sql = 'SELECT * FROM orden_de_pago WHERE contrato_id = ?';
    const [rows] = await pool.query(sql, [contratoId]);
    return rows[0] || null;
}

/**
 * Crea una nueva orden de pago en la base de datos.
 * @param {object} orden - Datos de la orden a crear.
 * @returns {object} Objeto con el ID de la nueva orden.
 */
async function crearOrdenDePago(orden) {
    const sql = `
        INSERT INTO orden_de_pago 
        (contrato_id, cliente_id, proveedor_id, monto_total, saldo_pendiente, fecha_de_creacion) 
        VALUES (?, ?, ?, ?, ?, NOW())
    `;
    
    // El saldo pendiente inicial es igual al monto total.
    const [result] = await pool.query(sql, [
        orden.contrato_id,
        orden.cliente_id,
        orden.proveedor_id,
        orden.total,
        orden.total 
    ]);

    return { id: result.insertId };
}

// --- NUEVAS FUNCIONES DE CONSULTA ---

/**
 * Busca una orden de pago por su ID principal.
 * @param {number} id - El ID de la orden de pago.
 * @returns {object|null} La orden de pago si existe, o null.
 */
async function buscarOrdenPorId(id) {
    const sql = 'SELECT * FROM orden_de_pago WHERE id = ?';
    const [rows] = await pool.query(sql, [id]);
    return rows[0] || null;
}

/**
 * Busca todas las órdenes de pago de un cliente.
 * @param {number} clienteId - El ID del cliente.
 * @returns {Array<object>} Un array con las órdenes de pago del cliente.
 */
async function buscarOrdenesPorClienteId(clienteId) {
    const sql = 'SELECT * FROM orden_de_pago WHERE cliente_id = ? ORDER BY fecha_de_creacion DESC';
    const [rows] = await pool.query(sql, [clienteId]);
    return rows;
}

/**
 * Busca todas las órdenes de pago de un proveedor.
 * @param {number} proveedorId - El ID del proveedor.
 * @returns {Array<object>} Un array con las órdenes de pago del proveedor.
 */
async function buscarOrdenesPorProveedorId(proveedorId) {
    const sql = 'SELECT * FROM orden_de_pago WHERE proveedor_id = ? ORDER BY fecha_de_creacion DESC';
    const [rows] = await pool.query(sql, [proveedorId]);
    return rows;
}

/**
 * Busca todas las órdenes de pago del sistema (para Admins).
 * @returns {Array<object>} Un array con todas las órdenes de pago.
 */
async function buscarTodasLasOrdenes() {
    const sql = 'SELECT * FROM orden_de_pago ORDER BY fecha_de_creacion DESC';
    const [rows] = await pool.query(sql);
    return rows;
}

// --- NUEVA FUNCIÓN DE TRANSACCIÓN ---

/**
 * Registra una transacción y actualiza la orden de pago de forma atómica.
 * @param {object} transaccion - Datos de la transacción (monto, metodo_pago, etc.).
 * @param {number} ordenId - El ID de la orden de pago a actualizar.
 * @param {object} connection - Una conexión activa de la base de datos para la transacción.
 */
async function registrarTransaccion(transaccion, ordenId, connection) {
    // 1. Insertar la nueva transacción
    const sqlTransaccion = `
        INSERT INTO transaccion (orden_de_pago_id, monto, fecha_transaccion, metodo_pago, id_referencia_externa) 
        VALUES (?, ?, NOW(), ?, ?)
    `;
    await connection.query(sqlTransaccion, [
        ordenId,
        transaccion.monto,
        transaccion.metodo_pago,
        transaccion.id_referencia_externa
    ]);

    // 2. Actualizar el saldo pendiente de la orden de pago
    const sqlActualizarOrden = 'UPDATE orden_de_pago SET saldo_pendiente = saldo_pendiente - ? WHERE id = ?';
    await connection.query(sqlActualizarOrden, [transaccion.monto, ordenId]);

    // 3. Verificar si el saldo ha llegado a 0 para actualizar el estado
    const sqlVerificarSaldo = 'SELECT saldo_pendiente FROM orden_de_pago WHERE id = ?';
    const [rows] = await connection.query(sqlVerificarSaldo, [ordenId]);
    const saldoActual = rows[0].saldo_pendiente;

    if (saldoActual <= 0) {
        const sqlMarcarPagado = "UPDATE orden_de_pago SET estado = 'PAGADO' WHERE id = ?";
        await connection.query(sqlMarcarPagado, [ordenId]);
    }
}

/**
 * NUEVO: Actualiza el estado de una orden de pago.
 * @param {number} id - El ID de la orden de pago a actualizar.
 * @param {string} estado - El nuevo estado para la orden.
 * @returns {number} El número de filas afectadas.
 */
async function actualizarEstadoOrden(id, estado) {
    // Podríamos añadir una validación de los estados permitidos aquí si quisiéramos
    const sql = "UPDATE orden_de_pago SET estado = ? WHERE id = ?";
    const [result] = await pool.query(sql, [estado, id]);
    return result.affectedRows;
}

/**
 * NUEVO: Busca todas las transacciones de una orden de pago específica.
 * @param {number} ordenId - El ID de la orden de pago.
 * @returns {Array<object>} Un array con todas las transacciones de la orden.
 */
async function buscarTransaccionesPorOrdenId(ordenId) {
    const sql = 'SELECT * FROM transaccion WHERE orden_de_pago_id = ? ORDER BY fecha_transaccion DESC';
    const [rows] = await pool.query(sql, [ordenId]);
    return rows;
}

module.exports = {
    pool, // Exportamos el pool para poder manejar transacciones desde el controlador
    buscarOrdenPorContratoId,
    crearOrdenDePago,
    buscarOrdenPorId,
    buscarOrdenesPorClienteId,
    buscarOrdenesPorProveedorId,
    buscarTodasLasOrdenes,
    registrarTransaccion,
    actualizarEstadoOrden,
    buscarTransaccionesPorOrdenId       
};