require('dotenv').config();

const base = {
  username: process.env.DB_USER || 'famola_app',
  password: process.env.DB_PASSWORD || 'changeme',
  database: process.env.DB_NAME || 'famola_erp',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  dialect: 'mysql',
};

module.exports = {
  development: base,
  test: base,
  production: base,
};
