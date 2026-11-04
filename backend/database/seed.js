// Cria o administrador inicial. Uso: npm run seed
// Le ADMIN_NOME, ADMIN_EMAIL e ADMIN_SENHA do arquivo .env
// (nenhuma credencial fica escrita no codigo).
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./conexao');

async function main() {
  const nome = process.env.ADMIN_NOME || 'Administrador';
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const senha = process.env.ADMIN_SENHA || '';

  if (!email || senha.length < 8) {
    console.error('Defina ADMIN_EMAIL e ADMIN_SENHA (minimo 8 caracteres) no .env');
    process.exit(1);
  }

  const [existe] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
  if (existe.length > 0) {
    console.log('Administrador ja existe. Nada a fazer.');
    return;
  }

  const senhaHash = await bcrypt.hash(senha, 10);
  await pool.query(
    "INSERT INTO usuarios (nome, email, senha_hash, nivel) VALUES (?, ?, ?, 'admin')",
    [nome, email, senhaHash]
  );
  console.log(`Administrador criado: ${email}`);
}

main()
  .catch((erro) => {
    console.error('Erro ao executar o seed:', erro.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
