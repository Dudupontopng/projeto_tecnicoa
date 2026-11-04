const express = require('express');
const controller = require('../controllers/authController');
const autenticar = require('../middlewares/autenticacaoMiddleware');

const router = express.Router();

router.post('/cadastro', controller.cadastrar); // publica
router.post('/login', controller.login);       // publica
router.get('/me', autenticar, controller.perfil); // qualquer usuario autenticado

module.exports = router;
