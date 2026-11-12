const express = require('express');
const controller = require('../controllers/categoriasController');
const autenticar = require('../middlewares/autenticacaoMiddleware');
const permitir = require('../middlewares/autorizacaoMiddleware');

const router = express.Router();

router.use(autenticar);

router.get('/', controller.listar); // qualquer usuário logado
router.post('/', permitir('admin'), controller.criar);
router.put('/:id', permitir('admin'), controller.atualizar);
router.delete('/:id', permitir('admin'), controller.remover);

module.exports = router;
