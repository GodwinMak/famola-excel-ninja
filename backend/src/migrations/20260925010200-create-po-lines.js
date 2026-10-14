'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('po_lines', {
      id: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
      customer_name: { type: Sequelize.STRING(191), allowNull: false },
      destination: { type: Sequelize.STRING(191), allowNull: true },
      po_number: { type: Sequelize.STRING(128), allowNull: false },
      contract: { type: Sequelize.STRING(128), allowNull: true },
      item_description: { type: Sequelize.TEXT, allowNull: false },
      po_date: { type: Sequelize.STRING(32), allowNull: true },
      unit_of_measure: { type: Sequelize.STRING(64), allowNull: true },
      quantity: { type: Sequelize.DECIMAL(16, 3), allowNull: false, defaultValue: 0 },
      unit_cost: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      unit_price: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      value_before_vat: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      vat_rate: { type: Sequelize.DECIMAL(6, 4), allowNull: false, defaultValue: 0.18 },
      vat_amount: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      value_after_vat: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      remarks: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('po_lines', ['po_number']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('po_lines');
  },
};
