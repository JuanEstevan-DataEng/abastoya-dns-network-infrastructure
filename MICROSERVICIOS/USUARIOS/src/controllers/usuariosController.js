// src/controllers/usuarioController.js

const express = require('express');
const router = express.Router();
const usuariosModel = require('../models/usuariosModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/authMiddleware');

// ¡MUY IMPORTANTE! Esta debe ser una cadena secreta compleja y guardada de forma segura.
// Por ahora, la ponemos aquí, pero en producción se usa una variable de entorno.
const JWT_SECRET = 'tu_secreto_super_secreto_para_jwt_12345';

// Ruta pública para que los CLIENTES y PROVEEDORES se registren
router.post('/registro', async (req, res) => {
    try {
        const { username, nombre, tipo, cedula_NIT, telefono, direccion, email, password } = req.body;

        // 1. Validación de campos obligatorios
        if (!username || !nombre || !tipo || !email || !password) {
            return res.status(400).json({ message: 'Los campos username, nombre, tipo, email y password son obligatorios.' });
        }

        // 2. Verificar que el tipo de usuario sea válido para esta ruta pública
        const tiposValidos = ["CLIENTE", "PROVEEDOR"];
        if (!tiposValidos.includes(tipo)) {
            return res.status(400).json({ message: `El tipo de usuario '${tipo}' no es válido para el registro público. Use la ruta apropiada si es administrador.` });
        }

        // 3. Verificar si el username o email ya existen
        const usuarioExistente = await usuariosModel.buscarPorUsernameOEmail(username, email);
        if (usuarioExistente) {
            return res.status(409).json({ message: 'El username o el email ya están registrados.' });
        }

        // 4. Hashear la contraseña del nuevo usuario
        const salt = await bcrypt.genSalt(10);
        const passwordHasheada = await bcrypt.hash(password, salt);

        // 5. Crear el objeto del nuevo usuario
        const nuevoUsuario = {
            username, nombre, tipo, cedula_NIT, telefono, direccion, email,
            password: passwordHasheada,
            estado: 'EN_APROBACION' // El estado por defecto para nuevos registros es 'EN_APROBACION'
        };

        // 6. Llamar al modelo para crear el usuario
        const usuarioCreado = await usuariosModel.crearUsuario(nuevoUsuario);

        // 7. Enviar respuesta de éxito
        res.status(201).json({
            message: 'Usuario registrado exitosamente. Su cuenta está pendiente de aprobación por un administrador.',
            usuarioId: usuarioCreado.id
        });

    } catch (error) {
        res.status(500).json({ message: 'Error en el servidor al registrar el usuario', error: error.message });
    }
});


// Ruta protegida para que un ADMIN cree a otro ADMIN
router.post('/crearUsuario', authMiddleware, async (req, res) => {
    try {
        // El usuario que hace la petición (identificado por el token)
        const adminSolicitante = req.usuario;

        // Solo los ADMINS pueden usar esta ruta
        if (adminSolicitante.tipo !== 'ADMIN') {
            return res.status(403).json({ message: 'Acceso denegado. Se requiere rol de administrador.' });
        }

        const { username, nombre, tipo, cedula_NIT, telefono, direccion, email, password, adminPassword } = req.body;

        // 1. Validación de campos obligatorios
        if (!username || !nombre || !tipo || !email || !password) {
            return res.status(400).json({ message: 'Los campos username, nombre, tipo, email y password son obligatorios.' });
        }

        // 2. Esta ruta solo permite crear usuarios de tipo ADMIN
        if (tipo !== 'ADMIN') {
            return res.status(400).json({ message: 'Esta ruta es exclusiva para la creación de nuevos administradores.' });
        }

        // 3. Se necesita la contraseña del admin solicitante para confirmar la acción
        if (!adminPassword) {
            return res.status(400).json({ message: 'Se requiere la contraseña del administrador actual para crear un nuevo administrador.' });
        }

        // 4. Verificar la contraseña del admin solicitante
        const adminActual = await usuariosModel.buscarPorId(adminSolicitante.id);
        if (!adminActual) {
            return res.status(404).json({ message: 'No se encontró al administrador solicitante.' });
        }
        const passwordValida = await bcrypt.compare(adminPassword, adminActual.password);

        if (!passwordValida) {
            return res.status(403).json({ message: 'La contraseña del administrador es incorrecta. Acción no autorizada.' });
        }

        // 5. Verificar si el username o email ya existen
        const usuarioExistente = await usuariosModel.buscarPorUsernameOEmail(username, email);
        if (usuarioExistente) {
            return res.status(409).json({ message: 'El username o el email ya están registrados.' });
        }

        // 6. Hashear la contraseña del nuevo admin
        const salt = await bcrypt.genSalt(10);
        const passwordHasheada = await bcrypt.hash(password, salt);

        // 7. Crear el objeto del nuevo usuario
        const nuevoUsuario = {
            username, nombre, tipo, cedula_NIT, telefono, direccion, email,
            password: passwordHasheada,
            estado: 'ACTIVO' // Los administradores se crean activos por defecto
        };

        // 8. Llamar al modelo para crear el usuario
        const usuarioCreado = await usuariosModel.crearUsuario(nuevoUsuario);

        // 9. Enviar respuesta de éxito
        res.status(201).json({
            message: 'Nuevo administrador creado exitosamente.',
            usuarioId: usuarioCreado.id
        });

    } catch (error) {
        res.status(500).json({ message: 'Error en el servidor al crear el usuario administrador', error: error.message });
    }
});

// POST /usuarios/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. Validar que llegaron los datos
        if (!username || !password) {
            return res.status(400).json({ message: 'El username y la contraseña son requeridos.' });
        }

        // 2. Buscar al usuario en la BD
        const usuario = await usuariosModel.buscarPorUsername(username);
        if (!usuario) {
            return res.status(401).json({ message: 'Credenciales inválidas.' }); // Usamos un mensaje genérico por seguridad
        }

        // 3. Validar que el usuario esté activo
        if (usuario.estado !== 'ACTIVO') {
            return res.status(403).json({ message: 'El usuario está inactivo o pendiente de aprobación. Contacte al administrador.' });
        }

        // 4. Comparar la contraseña
        const passwordValida = await bcrypt.compare(password, usuario.password);
        if (!passwordValida) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        // 5. Si todo es correcto, creamos el JWT
        const payload = {
            id: usuario.id,
            username: usuario.username,
            tipo: usuario.tipo
        };

        const token = jwt.sign(payload, JWT_SECRET, {
            expiresIn: '8h'
        });

        // 6. Enviamos el token al cliente
        res.json({
            message: 'Login exitoso!',
            token: token
        });

    } catch (error) {
        res.status(500).json({ message: 'Error en el servidor al intentar hacer login', error: error.message });
    }
});

// CONSULTAR TODOS LOS USUARIOS (SOLO ADMINS)
router.get('/verUsuarios', authMiddleware, async (req, res) => {
    try {
        if (req.usuario.tipo !== 'ADMIN') {
            return res.status(403).json({ message: 'Acceso denegado. Se requiere rol de administrador.' });
        }
        const usuarios = await usuariosModel.traerTodos();
        res.json(usuarios);
    } catch (error) {
        res.status(500).json({ message: 'Error en el servidor al obtener los usuarios', error: error.message });
    }
});

// --- OBTENER UN USUARIO POR SU ID (RUTA AHORA PÚBLICA PARA SERVICIOS INTERNOS) ---
router.get('/buscarUsuario/:id', async (req, res) => {
    try {   
        const { id } = req.params;
        const usuario = await usuariosModel.buscarPorId(id);

        if (!usuario) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        // ¡Importante! No enviar la contraseña en la respuesta.
        delete usuario.password;

        res.json(usuario);

    } catch (error) {
        res.status(500).json({ message: 'Error en el servidor al obtener el usuario', error: error.message });
    }
});

// --- ACTUALIZAR UN USUARIO ---
router.patch('/:actualizar/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const datosParaActualizar = req.body;

        if (req.usuario.tipo !== 'ADMIN' && req.usuario.id != id) {
            return res.status(403).json({ message: 'Acceso denegado. No tienes permiso para actualizar este usuario.' });
        }

        if (datosParaActualizar.password) {
            const salt = await bcrypt.genSalt(10);
            datosParaActualizar.password = await bcrypt.hash(datosParaActualizar.password, salt);
        }

        const filasAfectadas = await usuariosModel.actualizarUsuario(id, datosParaActualizar);

        if (filasAfectadas === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado o datos iguales.' });
        }

        res.json({ message: 'Usuario actualizado exitosamente.' });

    } catch (error) {
        res.status(500).json({ message: 'Error en el servidor al actualizar el usuario', error: error.message });
    }
});

// --- VERIFICACIÓN DE EXISTENCIA EN TIEMPO REAL ---
router.get('/check-username/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const usuario = await usuariosModel.buscarPorUsername(username);
        res.json({ existe: !!usuario });
    } catch (error) {
        res.status(500).json({ message: 'Error en el servidor.' });
    }
});

router.get('/check-email/:email', async (req, res) => {
    try {
        const { email } = req.params;
        // Asegurarse de que el email no sea undefined
        if (!email) {
            return res.status(400).json({ message: 'El email es requerido.' });
        }
        const usuario = await usuariosModel.buscarPorEmail(email);
        res.json({ existe: !!usuario });
    } catch (error) {
        res.status(500).json({ message: 'Error en el servidor.' });
    }
});


module.exports = router;
 
