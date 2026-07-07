// Usamos el módulo 'mysql2/promise' que nos permite usar async/await con MySQL
const mysql = require('mysql2/promise');

// 1. Creamos el "pool" de conexiones.
// Un pool es más eficiente que una única conexión porque gestiona y reutiliza
// conexiones a la base de datos, mejorando el rendimiento.
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: process.env.DB_PASSWORD || 'changeme', // Cambia esto si tienes una contraseña
    database: 'contratos' // Asegúrate que el nombre de tu BD sea este
});

/**
 * Función para crear un nuevo contrato y sus productos asociados en la BD.
 * @param {object} contrato - Objeto con los datos del contrato.
 * @param {number} contrato.cliente_id - ID del cliente.
 * @param {number} contrato.proveedor_id - ID del proveedor.
 * @param {number} contrato.total - El costo total calculado del contrato.
 * @param {Array<object>} contrato.productos - Un array de objetos, donde cada objeto es un producto del contrato.
 */
async function crearContrato(contrato) {
    // Obtenemos una conexión del pool para poder realizar la transacción.
    const connection = await pool.getConnection();

    try {
        // 2. Iniciamos la transacción.
        // A partir de aquí, todas las operaciones SQL son temporales hasta que hagamos 'commit'.
        await connection.beginTransaction();

        // 3. Insertamos el registro principal en la tabla 'contrato'.
        // El estado se establece por defecto y la fecha se genera con NOW().
        const sqlContrato = 'INSERT INTO contrato (cliente_id, proveedor_id, fecha_creacion, total) VALUES (?, ?, NOW(), ?)';
        const [contratoResult] = await connection.query(sqlContrato, [
            contrato.cliente_id,
            contrato.proveedor_id,
            contrato.total
        ]);

        // Obtenemos el ID del contrato que acabamos de crear. Lo necesitaremos para la siguiente tabla.
        const nuevoContratoId = contratoResult.insertId;

        // 4. Preparamos los datos para la inserción masiva en 'productos_contrato'.
        // Mapeamos el array de productos para que coincida con el formato que necesita la consulta SQL.
        const productosValues = contrato.productos.map(p => [
            nuevoContratoId,
            p.producto_id,
            p.nombre_producto,
            p.unidad,
            p.cantidad,
            p.precio_unitario,
            p.sub_total
        ]);

        // 5. Insertamos todos los productos asociados al contrato de una sola vez.
        // Usar 'VALUES ?' con un array de arrays es la forma más eficiente de hacer inserciones múltiples.
        const sqlProductos = 'INSERT INTO productos_contrato (contrato_id, producto_id, nombre_producto, unidad, cantidad, precio_unitario, sub_total) VALUES ?';
        await connection.query(sqlProductos, [productosValues]);

        // 6. Si ambas inserciones fueron exitosas, confirmamos la transacción.
        // En este punto, los datos se guardan permanentemente en la base de datos.
        await connection.commit();

        // Devolvemos el ID del contrato creado.
        return { id: nuevoContratoId };

    } catch (error) {
        // 7. Si ocurre cualquier error en el bloque 'try', revertimos la transacción.
        // Esto deshace todas las operaciones realizadas desde 'beginTransaction'.
        await connection.rollback();

        // Mostramos el error en la consola del servidor para poder depurarlo.
        console.error('Error en la transacción de crearContrato:', error);

        // Lanzamos el error para que la capa superior (el controlador) sepa que algo salió mal.
        throw new Error('Error al crear el contrato en la base de datos.');

    } finally {
        // 8. Pase lo que pase (éxito o error), siempre liberamos la conexión.
        // Esto devuelve la conexión al pool para que pueda ser reutilizada por otra petición.
        connection.release();
    }
}

// Aquí agregaríamos las otras funciones CRUD (traerContrato, traerContratos, actualizarContrato, etc.)

async function traerContratos() {
    // 1. La consulta SQL que une las dos tablas.
    // Usamos alias (c para contrato, pc para productos_contrato) para mayor claridad.
    // Es VITAL ordenar por el ID del contrato para que la agrupación en JS funcione correctamente.
    const sql = `
        SELECT
            c.id AS contrato_id,
            c.cliente_id,
            c.proveedor_id,
            c.fecha_creacion,
            c.estado,
            c.total,
            pc.id AS producto_contrato_id,
            pc.producto_id,
            pc.nombre_producto,
            pc.unidad,
            pc.cantidad,
            pc.precio_unitario,
            pc.sub_total
        FROM
            contrato AS c
        LEFT JOIN
            productos_contrato AS pc ON c.id = pc.contrato_id
        ORDER BY
            c.id DESC;
    `;

    try {
        const [rows] = await pool.query(sql);

        // 2. Procesamos el resultado para agrupar los productos por contrato.
        if (rows.length === 0) {
            return []; // Si no hay contratos, devolvemos un array vacío.
        }

        const contratos = {}; // Usaremos un objeto como mapa para facilitar la agrupación.

        for (const row of rows) {
            // Si aún no hemos visto este ID de contrato, lo creamos.
            if (!contratos[row.contrato_id]) {
                contratos[row.contrato_id] = {
                    id: row.contrato_id,
                    cliente_id: row.cliente_id,
                    proveedor_id: row.proveedor_id,
                    fecha_creacion: row.fecha_creacion,
                    estado: row.estado,
                    total: row.total,
                    productos: [] // Creamos su lista de productos vacía.
                };
            }

            // Si la fila tiene datos de un producto (no es un contrato sin productos),
            // lo agregamos a su lista.
            if (row.producto_contrato_id) {
                contratos[row.contrato_id].productos.push({
                    id_en_tabla_productos_contrato: row.producto_contrato_id,
                    producto_id_original: row.producto_id,
                    nombre: row.nombre_producto,
                    unidad: row.unidad,
                    cantidad: row.cantidad,
                    precio_unitario: row.precio_unitario,
                    sub_total: row.sub_total
                });
            }
        }

        // 3. Convertimos el objeto de contratos de nuevo en un array.
        // Object.values() toma todos los valores del objeto y los pone en una lista.
        return Object.values(contratos);

    } catch (error) {
        console.error("Error al traer los contratos:", error);
        throw new Error('Error al consultar los contratos en la base de datos.');
    }
}

/**
 * Función para consultar un contrato específico por su ID con sus productos.
 * @param {number} id - El ID del contrato a buscar.
 * @returns {object|null} - El objeto del contrato o null si no se encuentra.
 */
async function traerContratoPorId(id) {
    // 1. La misma consulta JOIN, pero con una cláusula WHERE para filtrar por ID.
    const sql = `
        SELECT
            c.id AS contrato_id,
            c.cliente_id,
            c.proveedor_id,
            c.fecha_creacion,
            c.estado,
            c.total,
            pc.id AS producto_contrato_id,
            pc.producto_id,
            pc.nombre_producto,
            pc.unidad,
            pc.cantidad,
            pc.precio_unitario,
            pc.sub_total
        FROM
            contrato AS c
        LEFT JOIN
            productos_contrato AS pc ON c.id = pc.contrato_id
        WHERE
            c.id = ?;
    `;

    try {
        // 2. Ejecutamos la consulta pasando el ID como un parámetro seguro.
        const [rows] = await pool.query(sql, [id]);

        // 3. Manejamos el caso en que no se encuentre el contrato.
        if (rows.length === 0) {
            return null; // Devolvemos null para indicar "No encontrado".
        }

        // 4. Creamos la estructura base del contrato usando la primera fila.
        // Como todas las filas pertenecen al mismo contrato, los datos generales son los mismos.
        const contrato = {
            id: rows[0].contrato_id,
            cliente_id: rows[0].cliente_id,
            proveedor_id: rows[0].proveedor_id,
            fecha_creacion: rows[0].fecha_creacion,
            estado: rows[0].estado,
            total: rows[0].total,
            productos: [] // Inicializamos el array de productos.
        };

        // 5. Recorremos todas las filas para agregar los productos.
        // Este bucle manejará tanto el caso de 1 producto como el de N productos.
        for (const row of rows) {
            // Si la fila tiene datos de un producto (producto_contrato_id no es null), lo agregamos.
            if (row.producto_contrato_id) {
                contrato.productos.push({
                    id_en_tabla_productos_contrato: row.producto_contrato_id,
                    producto_id_original: row.producto_id,
                    nombre: row.nombre_producto,
                    unidad: row.unidad,
                    cantidad: row.cantidad,
                    precio_unitario: row.precio_unitario,
                    sub_total: row.sub_total
                });
            }
        }

        return contrato;

    } catch (error) {
        console.error(`Error al traer el contrato con ID ${id}:`, error);
        throw new Error('Error al consultar el contrato en la base de datos.');
    }
}

/**
 * Función para actualizar únicamente el estado de un contrato.
 * @param {number} id - El ID del contrato a actualizar.
 * @param {string} estado - El nuevo estado del contrato.
 * @returns {number} - El número de filas afectadas por la actualización.
 */
async function actualizarEstadoContrato(id, estado) {
    // 1. Definimos los estados válidos para evitar inyección de datos incorrectos.
    const estadosValidos = ["EN_APROBACION", "APROBADO", "RECHAZADO", "TERMINADO"];
    if (!estadosValidos.includes(estado)) {
        // Si el estado no es válido, lanzamos un error que será atrapado por el controlador.
        throw new Error(`El estado '${estado}' no es válido.`);
    }

    // 2. La consulta SQL para actualizar el campo 'estado' del contrato con el ID correspondiente.
    const sql = 'UPDATE contrato SET estado = ? WHERE id = ?';

    try {
        // 3. Ejecutamos la consulta pasando los valores de forma segura para prevenir inyección SQL.
        const [result] = await pool.query(sql, [estado, id]);

        // 4. Devolvemos el número de filas afectadas.
        // Si es 1, significa que el contrato se actualizó.
        // Si es 0, significa que no se encontró ningún contrato con ese ID.
        return result.affectedRows;

    } catch (error) {
        console.error(`Error al actualizar el estado del contrato con ID ${id}:`, error);
        // Relanzamos el error para que el controlador lo maneje.
        throw new Error('Error al actualizar el estado en la base de datos.');
    }
}

/**
 * Función para traer todos los contratos de un proveedor específico.
 * @param {number} proveedorId - El ID del proveedor.
 * @returns {Array<object>} - Un array con los contratos del proveedor, incluyendo sus productos.
 */
async function traerContratosPorProveedorId(proveedorId) {
    // 1. La consulta es muy similar a traerContratos, pero con una cláusula WHERE
    // para filtrar por el ID del proveedor.
    const sql = `
        SELECT
            c.id AS contrato_id,
            c.cliente_id,
            c.proveedor_id,
            c.fecha_creacion,
            c.estado,
            c.total,
            pc.id AS producto_contrato_id,
            pc.producto_id,
            pc.nombre_producto,
            pc.unidad,
            pc.cantidad,
            pc.precio_unitario,
            pc.sub_total
        FROM
            contrato AS c
        LEFT JOIN
            productos_contrato AS pc ON c.id = pc.contrato_id
        WHERE
            c.proveedor_id = ?
        ORDER BY
            c.id DESC;
    `;

    try {
        // 2. Ejecutamos la consulta pasando el ID del proveedor.
        const [rows] = await pool.query(sql, [proveedorId]);

        // 3. Si no hay resultados, devolvemos un array vacío.
        if (rows.length === 0) {
            return [];
        }

        // 4. La lógica de agrupación es IDÉNTICA a la de traerContratos.
        const contratos = {};
        for (const row of rows) {
            if (!contratos[row.contrato_id]) {
                contratos[row.contrato_id] = {
                    id: row.contrato_id,
                    cliente_id: row.cliente_id,
                    proveedor_id: row.proveedor_id,
                    fecha_creacion: row.fecha_creacion,
                    estado: row.estado,
                    total: row.total,
                    productos: []
                };
            }
            if (row.producto_contrato_id) {
                contratos[row.contrato_id].productos.push({
                    id_en_tabla_productos_contrato: row.producto_contrato_id,
                    producto_id_original: row.producto_id,
                    nombre: row.nombre_producto,
                    unidad: row.unidad,
                    cantidad: row.cantidad,
                    precio_unitario: row.precio_unitario,
                    sub_total: row.sub_total
                });
            }
        }

        // 5. Convertimos el objeto a un array y lo devolvemos.
        return Object.values(contratos);

    } catch (error) {
        console.error(`Error al traer los contratos del proveedor ${proveedorId}:`, error);
        throw new Error('Error al consultar los contratos por proveedor en la base de datos.');
    }
}

/**
 * Función para traer todos los contratos de un cliente específico.
 * @param {number} clienteId - El ID del cliente.
 * @returns {Array<object>} - Un array con los contratos del cliente, incluyendo sus productos.
 */
async function traerContratosPorClienteId(clienteId) {
    // 1. La consulta es la misma, pero el WHERE filtra por 'c.cliente_id'.
    const sql = `
        SELECT
            c.id AS contrato_id,
            c.cliente_id,
            c.proveedor_id,
            c.fecha_creacion,
            c.estado,
            c.total,
            pc.id AS producto_contrato_id,
            pc.producto_id,
            pc.nombre_producto,
            pc.unidad,
            pc.cantidad,
            pc.precio_unitario,
            pc.sub_total
        FROM
            contrato AS c
        LEFT JOIN
            productos_contrato AS pc ON c.id = pc.contrato_id
        WHERE
            c.cliente_id = ?
        ORDER BY
            c.id DESC;
    `;

    try {
        const [rows] = await pool.query(sql, [clienteId]);

        if (rows.length === 0) {
            return [];
        }

        // 2. La lógica de agrupación de productos no cambia.
        const contratos = {};
        for (const row of rows) {
            if (!contratos[row.contrato_id]) {
                contratos[row.contrato_id] = {
                    id: row.contrato_id,
                    cliente_id: row.cliente_id,
                    proveedor_id: row.proveedor_id,
                    fecha_creacion: row.fecha_creacion,
                    estado: row.estado,
                    total: row.total,
                    productos: []
                };
            }
            if (row.producto_contrato_id) {
                contratos[row.contrato_id].productos.push({
                    id_en_tabla_productos_contrato: row.producto_contrato_id,
                    producto_id_original: row.producto_id,
                    nombre: row.nombre_producto,
                    unidad: row.unidad,
                    cantidad: row.cantidad,
                    precio_unitario: row.precio_unitario,
                    sub_total: row.sub_total
                });
            }
        }

        return Object.values(contratos);

    } catch (error) {
        console.error(`Error al traer los contratos del cliente ${clienteId}:`, error);
        throw new Error('Error al consultar los contratos por cliente en la base de datos.');
    }
}

// Exportamos la función para que pueda ser usada desde el controlador.
module.exports = {
    crearContrato,
    traerContratos,
    traerContratoPorId,
    actualizarEstadoContrato,
    traerContratosPorProveedorId,
    traerContratosPorClienteId
};