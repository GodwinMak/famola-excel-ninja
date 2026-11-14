'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('document_issues', {
      id: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
      entity_type: {
        type: Sequelize.ENUM('INVOICE', 'DELIVERY', 'PAYMENT'),
        allowNull: false,
      },
      entity_id: { type: Sequelize.STRING(64), allowNull: true },
      reference_number: { type: Sequelize.STRING(191), allowNull: false },
      po_number: { type: Sequelize.STRING(128), allowNull: true },
      customer_name: { type: Sequelize.STRING(191), allowNull: true },
      destination: { type: Sequelize.STRING(191), allowNull: true },
      contract: { type: Sequelize.STRING(128), allowNull: true },
      total_value: { type: Sequelize.DECIMAL(16, 2), allowNull: true, defaultValue: 0 },
      disputed_amount: { type: Sequelize.DECIMAL(16, 2), allowNull: true, defaultValue: 0 },
      issue_title: { type: Sequelize.STRING(255), allowNull: false },
      primary_issue: { type: Sequelize.STRING(255), allowNull: true },
      issue_type: {
        type: Sequelize.ENUM(
          'Quantity Discrepancy',
          'Pricing / Rate Error',
          'Missing Delivery Ref',
          'VAT / Calculation Error',
          'Wrong PO Reference',
          'Damaged / Rejected Goods',
          'Payment Mismatch',
          'Customer Query',
          'Other'
        ),
        allowNull: false,
      },
      severity: {
        type: Sequelize.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('PENDING', 'UNDER_REVIEW', 'RESOLVED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      flagged_by: { type: Sequelize.STRING(191), allowNull: false },
      flagged_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      header_comment: { type: Sequelize.TEXT, allowNull: true },
      review_comment: { type: Sequelize.TEXT, allowNull: true },
      resolved_by: { type: Sequelize.STRING(191), allowNull: true },
      resolved_at: { type: Sequelize.DATE, allowNull: true },
      resolution_notes: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('document_issues', ['reference_number']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('document_issues');
  },
};
