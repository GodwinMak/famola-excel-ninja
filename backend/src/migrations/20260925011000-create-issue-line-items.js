'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('issue_line_items', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      issue_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
        references: { model: 'document_issues', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      line_id: { type: Sequelize.STRING(64), allowNull: true },
      item_description: { type: Sequelize.TEXT, allowNull: true },
      unit_of_measure: { type: Sequelize.STRING(64), allowNull: true },
      po_quantity: { type: Sequelize.DECIMAL(16, 3), allowNull: true },
      billed_or_delivered_quantity: { type: Sequelize.DECIMAL(16, 3), allowNull: true },
      quantity_invoiced: { type: Sequelize.DECIMAL(16, 3), allowNull: true },
      quantity_delivered: { type: Sequelize.DECIMAL(16, 3), allowNull: true },
      discrepancy_quantity: { type: Sequelize.DECIMAL(16, 3), allowNull: true },
      unit_price: { type: Sequelize.DECIMAL(16, 2), allowNull: true },
      value_after_vat: { type: Sequelize.DECIMAL(16, 2), allowNull: true },
      total_value: { type: Sequelize.DECIMAL(16, 2), allowNull: true },
      issue_comment: { type: Sequelize.TEXT, allowNull: false },
      issue_reason: { type: Sequelize.STRING(255), allowNull: true },
      work_comment: { type: Sequelize.TEXT, allowNull: true },
      reviewer_comment: { type: Sequelize.TEXT, allowNull: true },
      status: {
        type: Sequelize.ENUM('PENDING', 'RESOLVED'),
        allowNull: true,
        defaultValue: 'PENDING',
      },
    });
    await queryInterface.addIndex('issue_line_items', ['issue_id']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('issue_line_items');
  },
};
