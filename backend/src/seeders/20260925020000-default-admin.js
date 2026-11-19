'use strict';

const bcrypt = require('bcrypt');
require('dotenv').config();

module.exports = {
  up: async (queryInterface) => {
    const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
    const name = process.env.SEED_ADMIN_NAME || 'System Administrator';
    const password = process.env.SEED_ADMIN_PASSWORD || 'changeme_on_first_login';

    const existing = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email = :email LIMIT 1',
      { replacements: { email }, type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    if (existing && existing.length > 0) {
      console.log(`Seeder: admin user ${email} already exists, skipping.`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();

    await queryInterface.bulkInsert('users', [
      {
        id: 'usr-admin-1',
        username: 'admin',
        name,
        email,
        role: 'Admin',
        department: 'Management',
        status: 'Active',
        password_hash: passwordHash,
        pin_hash: null,
        screen_permissions: JSON.stringify({
          dashboard: 'edit',
          po_master: 'edit',
          create_invoice: 'edit',
          invoices_db: 'edit',
          issue_tracking: 'edit',
          delivery_notes: 'edit',
          delivery_details: 'edit',
          matching_report: 'edit',
          payments: 'edit',
          ledger: 'edit',
          settings: 'edit',
          database: 'edit',
        }),
        last_login_at: null,
        created_at: now,
        updated_at: now,
      },
    ]);

    console.log(`Seeder: created admin user ${email} — change the password on first login.`);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('users', { id: 'usr-admin-1' });
  },
};
