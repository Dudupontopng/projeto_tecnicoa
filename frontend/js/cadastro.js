const form = document.getElementById('form-cadastro');
const selectNivel = document.getElementById('nivel');
const camposInstituicao = document.getElementById('campos-instituicao');
const msg = document.getElementById('msg');
const botao = document.getElementById('btn-cadastrar');

function mostrarAviso(texto, tipo) {
  msg.textContent = texto;
  msg.className = `aviso ${tipo} msg-form`;
}

// Os campos extras só aparecem para instituições.
selectNivel.addEventListener('change', () => {
  camposInstituicao.classList.toggle('escondido', selectNivel.value !== 'instituicao');
});

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  msg.classList.add('escondido');

  const nivel = selectNivel.value;
  const corpo = {
    nivel,
    nome: document.getElementById('nome').value.trim(),
    email: document.getElementById('email').value.trim(),
    senha: document.getElementById('senha').value,
  };
  if (nivel === 'instituicao') {
    corpo.nome_instituicao = document.getElementById('nome_instituicao').value.trim();
    corpo.endereco = document.getElementById('endereco').value.trim();
    corpo.cidade = document.getElementById('cidade').value.trim();
  }

  botao.disabled = true;
  try {
    const resposta = await api('/auth/cadastro', { metodo: 'POST', corpo });
    mostrarAviso(`${resposta.mensagem} Redirecionando para o login...`, 'ok');
    setTimeout(() => irPara('login.html'), 2000);
  } catch (erro) {
    mostrarAviso(erro.message, 'erro');
    botao.disabled = false;
  }
});
