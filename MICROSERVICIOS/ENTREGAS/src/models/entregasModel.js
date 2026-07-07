const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: process.env.DB_PASSWORD || 'changeme', // Cambia tu contraseña
    database: 'entregas'
});

async function buscarPorContratoId(contratoId) {
    const sql = 'SELECT * FROM entrega WHERE contrato_id = ?';
    const [rows] = await pool.query(sql, [contratoId]);
    return rows[0] || null;
}

async function buscarPorOrdenDePagoId(ordenDePagoId) {
    const sql = 'SELECT * FROM entrega WHERE orden_de_pago_id = ?';
    const [rows] = await pool.query(sql, [ordenDePagoId]);
    return rows[0] || null;
}


async function crearEntrega(entrega) {

    const fechaEstimada = new Date();
    fechaEstimada.setDate(fechaEstimada.getDate() + 3);

    const sql = `
        INSERT INTO entrega (contrato_id, orden_de_pago_id, cliente_id, proveedor_id, direccion_entrega, telefono_contacto, fecha_creacion, fecha_estimada_entrega, estado)
        VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, 'PENDIENTE')
    `;
    const [result] = await pool.query(sql, [
        entrega.contrato_id,
        entrega.orden_de_pago_id,
        entrega.cliente_id,
        entrega.proveedor_id,
        entrega.direccion_entrega,
        entrega.telefono_contacto,
        fechaEstimada
    ]);

    return { id: result.insertId };
}

async function buscarEntregasPorClienteId(clienteId) {
    const sql = 'SELECT * FROM entrega WHERE cliente_id = ? ORDER BY fecha_creacion DESC';
    const [rows] = await pool.query(sql, [clienteId]);
    return rows;
}

async function buscarEntregasPorProveedorId(proveedorId) {
    const sql = 'SELECT * FROM entrega WHERE proveedor_id = ? ORDER BY fecha_creacion DESC';
    const [rows] = await pool.query(sql, [proveedorId]);
    return rows;
}

async function buscarTodasLasEntregas() {
    const sql = 'SELECT * FROM entrega ORDER BY fecha_creacion DESC';
    const [rows] = await pool.query(sql);
    return rows;
}

async function buscarEntregaPorId(id) {
    const sql = 'SELECT * FROM entrega WHERE id = ?';
    const [rows] = await pool.query(sql, [id]);
    return rows[0] || null;
}

async function actualizarEntrega(id, datos) {
    const campos = Object.keys(datos);
    const valores = Object.values(datos);

    if (campos.length === 0) return 0;

    const setClause = campos.map(campo => `${campo} = ?`).join(', ');
    const sql = `UPDATE entrega SET ${setClause} WHERE id = ?`;

    const [result] = await pool.query(sql, [...valores, id]);
    return result.affectedRows;
}

module.exports = {
    buscarPorContratoId,
    buscarPorOrdenDePagoId,
    crearEntrega,
    buscarEntregasPorClienteId,
    buscarEntregasPorProveedorId,
    buscarTodasLasEntregas,
    crearEntrega,
    buscarEntregaPorId,
    actualizarEntrega
};