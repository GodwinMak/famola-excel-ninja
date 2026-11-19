'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('invitations', {
      id: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
      email: { type: Sequelize.STRING(191), allowNull: false },
      name: { type: Sequelize.STRING(191), allowNull: false },
      role: {
        type: Sequelize.ENUM('Admin', 'Finance Officer', 'Logistics Manager', 'Billing Clerk', 'Auditor'),
        allowNull: false,
      },
      department: { type: Sequelize.STRING(128), allowNull: true },
      token: { type: Sequelize.STRING(191), allowNull: false, unique: true },
      token_expires_at: { type: Sequelize.DATE, allowNull: false },
      status: {
        type: Sequelize.ENUM('Active', 'Pending', 'Revoked'),
        allowNull: false,
        defaultValue: 'Pending',
      },
      invited_by: { type: Sequelize.STRING(191), allowNull: true },
      last_used_at: { type: Sequelize.DATE, allowNull: true },
      screen_permissions: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('invitations', ['email']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('invitations');
  },
};
