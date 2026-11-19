'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('customer_series_books', {
      id: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
      customer_name: { type: Sequelize.STRING(191), allowNull: false, unique: true },
      invoice_prefix: { type: Sequelize.STRING(32), allowNull: false },
      invoice_start_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      invoice_end_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 999999 },
      invoice_current_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      delivery_prefix: { type: Sequelize.STRING(32), allowNull: false },
      delivery_start_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      delivery_end_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 999999 },
      delivery_current_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      padding: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 3 },
      description: { type: Sequelize.STRING(255), allowNull: true },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('customer_series_books');
  },
};
