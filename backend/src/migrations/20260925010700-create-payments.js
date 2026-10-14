'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('payments', {
      id: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
      payment_number: { type: Sequelize.STRING(128), allowNull: false, unique: true },
      payment_date: { type: Sequelize.STRING(32), allowNull: true },
      invoice_id: { type: Sequelize.STRING(64), allowNull: true },
      invoice_number: { type: Sequelize.STRING(128), allowNull: true },
      po_number: { type: Sequelize.STRING(128), allowNull: true },
      customer_name: { type: Sequelize.STRING(191), allowNull: false },
      amount_paid: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      payment_method: {
        type: Sequelize.ENUM('Bank Transfer', 'Cheque', 'Cash', 'EFT', 'Mobile Money'),
        allowNull: false,
      },
      reference_number: { type: Sequelize.STRING(191), allowNull: true },
      deposit_account: { type: Sequelize.STRING(191), allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      has_issue: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      issue_comment: { type: Sequelize.TEXT, allowNull: true },
      issue_id: { type: Sequelize.STRING(64), allowNull: true },
      issue_status: {
        type: Sequelize.ENUM('PENDING', 'UNDER_REVIEW', 'RESOLVED'),
        allowNull: true,
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('payments', ['po_number']);
    await queryInterface.addIndex('payments', ['invoice_number']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('payments');
  },
};
