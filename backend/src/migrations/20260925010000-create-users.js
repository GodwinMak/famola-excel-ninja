'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('users', {
      id: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
      username: { type: Sequelize.STRING(128), allowNull: true },
      name: { type: Sequelize.STRING(191), allowNull: false },
      email: { type: Sequelize.STRING(191), allowNull: false, unique: true },
      role: {
        type: Sequelize.ENUM('Admin', 'Finance Officer', 'Logistics Manager', 'Billing Clerk', 'Auditor'),
        allowNull: false,
      },
      department: { type: Sequelize.STRING(128), allowNull: true },
      status: {
        type: Sequelize.ENUM('Active', 'On Hold', 'Inactive'),
        allowNull: false,
        defaultValue: 'Active',
      },
      password_hash: { type: Sequelize.STRING(191), allowNull: true },
      pin_hash: { type: Sequelize.STRING(191), allowNull: true },
      screen_permissions: { type: Sequelize.JSON, allowNull: true },
      last_login_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('users');
  },
};
