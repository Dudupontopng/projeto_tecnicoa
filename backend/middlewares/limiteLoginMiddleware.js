// Proteção contra tentativa de adivinhar senhas (força bruta).
// Depois de MAX_FALHAS logins errados seguidos para o mesmo e-mail e IP, bloqueia por 15 minutos.
// O controle fica em memória: reinicia junto com o servidor (suficiente para este projeto).
const JANELA_MS = 15 * 60 * 1000;
const MAX_FALHAS = 10;
const registros = new Map(); // chave -> { falhas, desde }

function chaveDe(req) {
  const email = req.body && typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return `${req.ip}|${email}`;
}

function limitarLogin(req, res, next) {
  const chave = chaveDe(req);
  const registro = registros.get(chave);

  if (registro && Date.now() - registro.desde > JANELA_MS) {
    registros.delete(chave);
  } else if (registro && registro.falhas >= MAX_FALHAS) {
    const minutos = Math.ceil((JANELA_MS - (Date.now() - registro.desde)) / 60000);
    res.set('Retry-After', String(minutos * 60));
    return res.status(429).json({
      erro: `Muitas tentativas de login. Tente novamente em ${minutos} minuto(s).`,
    });
  }

  // Depois que a resposta é enviada: conta a falha (401) ou zera o contador (login correto).
  res.on('finish', () => {
    if (res.statusCode === 401) {
      const atual = registros.get(chave) || { falhas: 0, desde: Date.now() };
      atual.falhas += 1;
      registros.set(chave, atual);
    } else if (res.statusCode === 200) {
      registros.delete(chave);
    }
  });
  return next();
}

// Limpeza periódica para o mapa não crescer indefinidamente.
setInterval(() => {
  const agora = Date.now();
  for (const [chave, registro] of registros) {
    if (agora - registro.desde > JANELA_MS) registros.delete(chave);
  }
}, 5 * 60 * 1000).unref();

module.exports = limitarLogin;
