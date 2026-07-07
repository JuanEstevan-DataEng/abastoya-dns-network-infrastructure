// src/models/usuarioModel.js

const mysql = require('mysql2/promise');

// Configura tu pool de conexiones a la base de datos de usuarios
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: process.env.DB_PASSWORD || 'changeme', // Cambia tu contraseña
    database: 'usuarios'
});

/**
 * Busca un usuario por su nombre de usuario (username).
 * @param {string} username - El nombre de usuario a buscar.
 * @returns {object|null} - El objeto del usuario si se encuentra, o null si no.
 */
async function buscarPorUsername(username) {
    try {
        const sql = 'SELECT * FROM usuario WHERE username = ?';
        const [rows] = await pool.query(sql, [username]);

        // query devuelve un array, si no hay resultados, estará vacío.
        // Devolvemos el primer (y único) resultado.
        return rows[0] || null;

    } catch (error) {
        console.error("Error al buscar usuario por username:", error);
        throw new Error('Error en la base de datos al buscar el usuario.');
    }
}

async function buscarPorEmail(email) {
    try {
        const sql = 'SELECT * FROM usuario WHERE email = ?';
        const [rows] = await pool.query(sql, [email]);
        return rows[0] || null;
    } catch (error) {
        console.error("Error al buscar usuario por email:", error);
        throw new Error('Error en la base de datos al buscar el usuario.');
    }
}

/**
 * Busca un usuario por su username o email para evitar duplicados.
 * @param {string} username - El nombre de usuario a buscar.
 * @param {string} email - El email a buscar.
 * @returns {object|null} - El usuario encontrado o null.
 */
async function buscarPorUsernameOEmail(username, email) {
    try {
        const sql = 'SELECT * FROM usuario WHERE username = ? OR email = ?';
        const [rows] = await pool.query(sql, [username, email]);
        return rows[0] || null;
    } catch (error) {
        console.error("Error al buscar por username o email:", error);
        throw new Error('Error en la base de datos al verificar duplicados.');
    }
}

/**
 * Crea un nuevo usuario en la base de datos.
 * @param {object} usuario - Objeto con todos los datos del usuario.
 * @returns {object} - Objeto con el ID del nuevo usuario insertado.
 */
async function crearUsuario(usuario) {
    try {
        const sql = `
            INSERT INTO usuario 
            (username, nombre, tipo, cedula_NIT, telefono, direccion, email, password) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.query(sql, [
            usuario.username,
            usuario.nombre,
            usuario.tipo,
            usuario.cedula_NIT,
            usuario.telefono,
            usuario.direccion,
            usuario.email,
            usuario.password // ¡Aquí ya debe venir hasheada desde el controlador!
        ]);

        return { id: result.insertId };

    } catch (error) {
        console.error("Error al crear el usuario:", error);
        throw new Error('Error en la base de datos al crear el usuario.');
    }
}

/**
 * Trae todos los usuarios de la base de datos sin incluir la contraseña.
 * @returns {Array<object>} - Un array de objetos de usuario.
 */
async function traerTodos() {
    try {
        const sql = 'SELECT id, username, nombre, tipo, cedula_NIT, telefono, direccion, email, estado FROM usuario';
        const [rows] = await pool.query(sql);
        return rows;
    } catch (error) {
        console.error("Error al traer todos los usuarios:", error);
        throw new Error('Error en la base de datos al consultar los usuarios.');
    }
}

/**
 * Busca un usuario por su ID sin incluir la contraseña.
 * @param {number} id - El ID del usuario a buscar.
 * @returns {object|null} - El objeto del usuario o null si no se encuentra.
 */
async function buscarPorId(id) {
    try {
        const sql = 'SELECT id, username, nombre, tipo, cedula_NIT, telefono, direccion, email, estado FROM usuario WHERE id = ?';
        const [rows] = await pool.query(sql, [id]);
        return rows[0] || null;
    } catch (error) {
        console.error("Error al buscar usuario por id:", error);
        throw new Error('Error en la base de datos al buscar el usuario.');
    }
}

/**
 * Actualiza los datos de un usuario en la base de datos.
 * @param {number} id - El ID del usuario a actualizar.
 * @param {object} datos - Un objeto con los campos a actualizar.
 * @returns {number} - El número de filas afectadas.
 */
async function actualizarUsuario(id, datos) {
    try {
        // Construimos la consulta dinámicamente para actualizar solo los campos que nos envíen
        const campos = Object.keys(datos); // ['nombre', 'telefono']
        const valores = Object.values(datos); // ['Nuevo Nombre', 12345]

        if (campos.length === 0) {
            return 0; // No hay nada que actualizar
        }

        const setClause = campos.map(campo => `${campo} = ?`).join(', '); // "nombre = ?, telefono = ?"
        const sql = `UPDATE usuario SET ${setClause} WHERE id = ?`;

        const [result] = await pool.query(sql, [...valores, id]);
        return result.affectedRows;

    } catch (error) {
        console.error("Error al actualizar el usuario:", error);
        throw new Error('Error en la base de datos al actualizar el usuario.');
    }
}

module.exports = {
    buscarPorUsername, 
    buscarPorUsernameOEmail,
    crearUsuario,
    traerTodos,
    buscarPorId,
    actualizarUsuario
};