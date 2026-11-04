const express = require('express');
const controller = require('../controllers/usuariosController');
const autenticar = require('../middlewares/autenticacaoMiddleware');
const permitir = require('../middlewares/autorizacaoMiddleware');

const router = express.Router();

// Todas as rotas deste arquivo: autenticado + perfil admin
router.use(autenticar, permitir('admin'));

router.get('/', controller.listar);
router.get('/:id', controller.buscarPorId);

module.exports = router;
