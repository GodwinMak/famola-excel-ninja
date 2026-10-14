'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('invoice_lines', {
      id: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false, defaultValue: Sequelize.UUIDV4 },
      invoice_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
        references: { model: 'invoices', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      po_line_id: { type: Sequelize.STRING(64), allowNull: true },
      item_description: { type: Sequelize.TEXT, allowNull: false },
      unit_of_measure: { type: Sequelize.STRING(64), allowNull: true },
      po_quantity: { type: Sequelize.DECIMAL(16, 3), allowNull: false, defaultValue: 0 },
      already_invoiced_quantity: { type: Sequelize.DECIMAL(16, 3), allowNull: false, defaultValue: 0 },
      available_quantity: { type: Sequelize.DECIMAL(16, 3), allowNull: false, defaultValue: 0 },
      invoiced_quantity: { type: Sequelize.DECIMAL(16, 3), allowNull: false, defaultValue: 0 },
      unit_cost: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      unit_price: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      value_before_vat: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      vat_rate: { type: Sequelize.DECIMAL(6, 4), allowNull: false, defaultValue: 0.18 },
      vat_amount: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      value_after_vat: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      is_selected: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      comment: { type: Sequelize.STRING(255), allowNull: true, defaultValue: 'Okay' },
      has_issue: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      issue_comment: { type: Sequelize.TEXT, allowNull: true },
    });
    await queryInterface.addIndex('invoice_lines', ['invoice_id']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('invoice_lines');
  },
};
