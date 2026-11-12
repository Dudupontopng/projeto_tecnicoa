const express = require('express');
const controller = require('../controllers/doacoesController');
const autenticar = require('../middlewares/autenticacaoMiddleware');
const permitir = require('../middlewares/autorizacaoMiddleware');

const router = express.Router();

router.use(autenticar); // todas as rotas exigem login

router.get('/', controller.listar);        // filtrado por perfil dentro do controller
router.get('/:id', controller.buscarPorId);
router.post('/', permitir('doador', 'admin'), controller.criar);
router.put('/:id', permitir('doador', 'admin'), controller.atualizar);    // dono ou admin
router.delete('/:id', permitir('doador', 'admin'), controller.remover);   // dono ou admin

module.exports = router;
