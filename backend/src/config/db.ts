import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

export const sequelize = new Sequelize(
  process.env.DB_NAME || 'famola_erp',
  process.env.DB_USER || 'famola_app',
  process.env.DB_PASSWORD || 'changeme',
  {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    logging: false,
    dialectOptions: {
      // mysql2 returns DECIMAL/NEWDECIMAL columns as strings by default (to avoid
      // silent precision loss), but every quantity/money field in this schema is
      // DECIMAL and the whole app — frontend sums, VAT math, exports — treats them
      // as JS numbers. Left uncast, a value fetched from the DB and then summed
      // with `total += row.field` silently does string concatenation instead of
      // addition (e.g. quantities "9600.000" + "1000.000" becoming "09600.0001000.000")
      // instead of throwing, which made it a silent, hard-to-spot data bug rather
      // than a crash. Casting once here, at the driver boundary, fixes it for every
      // table and every route instead of patching each consumer separately.
      typeCast: (field: any, next: () => unknown) => {
        if (field.type === 'DECIMAL' || field.type === 'NEWDECIMAL') {
          const value = field.string();
          return value === null ? null : parseFloat(value);
        }
        return next();
      },
    },
  }
);
