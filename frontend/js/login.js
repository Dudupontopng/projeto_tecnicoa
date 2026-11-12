// Se já estiver logado, vai direto para o painel do perfil.
const logado = obterUsuario();
if (obterToken() && logado && PAGINAS[logado.nivel]) {
  irPara(PAGINAS[logado.nivel]);
}

const formLogin = document.getElementById('form-login');
const msg = document.getElementById('msg');
const botao = document.getElementById('btn-entrar');

formLogin.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  msg.classList.add('escondido');

  const email = document.getElementById('email').value.trim();
  const senha = document.getElementById('senha').value;
  if (!email || !senha) {
    msg.textContent = 'Informe e-mail e senha.';
    msg.classList.remove('escondido');
    return;
  }

  botao.disabled = true;
  try {
    const resposta = await api('/auth/login', { metodo: 'POST', corpo: { email, senha } });
    salvarSessao(resposta.token, resposta.usuario);
    irPara(PAGINAS[resposta.usuario.nivel]);
  } catch (erro) {
    msg.textContent = erro.message;
    msg.classList.remove('escondido');
  } finally {
    botao.disabled = false;
  }
});
