'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('invoices', {
      id: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
      invoice_number: { type: Sequelize.STRING(128), allowNull: false, unique: true },
      invoice_date: { type: Sequelize.STRING(32), allowNull: true },
      po_number: { type: Sequelize.STRING(128), allowNull: true },
      customer_name: { type: Sequelize.STRING(191), allowNull: false },
      destination: { type: Sequelize.STRING(191), allowNull: true },
      contract: { type: Sequelize.STRING(128), allowNull: true },
      po_date: { type: Sequelize.STRING(32), allowNull: true },
      subtotal_before_vat: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      total_vat: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      total_after_vat: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      paid_amount: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      payment_status: {
        type: Sequelize.ENUM('PAID', 'PARTIAL', 'UNPAID'),
        allowNull: false,
        defaultValue: 'UNPAID',
      },
      notes: { type: Sequelize.TEXT, allowNull: true },
      comment: { type: Sequelize.TEXT, allowNull: true },
      status: {
        type: Sequelize.ENUM('ACTIVE', 'CANCELLED', 'OFR'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      is_cancelled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      is_flagged: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      cancel_reason: { type: Sequelize.TEXT, allowNull: true },
      is_ofr: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      ofr_detail: { type: Sequelize.TEXT, allowNull: true },
      has_issue: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      issue_comment: { type: Sequelize.TEXT, allowNull: true },
      issue_id: { type: Sequelize.STRING(64), allowNull: true },
      issue_status: {
        type: Sequelize.ENUM('PENDING', 'UNDER_REVIEW', 'RESOLVED'),
        allowNull: true,
      },
      last_modified_by: { type: Sequelize.STRING(191), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('invoices', ['po_number']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('invoices');
  },
};
