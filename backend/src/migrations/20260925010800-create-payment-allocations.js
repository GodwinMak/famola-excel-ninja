'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('payment_allocations', {
      id: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false, defaultValue: Sequelize.UUIDV4 },
      payment_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
        references: { model: 'payments', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      invoice_id: { type: Sequelize.STRING(64), allowNull: true },
      invoice_number: { type: Sequelize.STRING(128), allowNull: true },
      po_number: { type: Sequelize.STRING(128), allowNull: true },
      customer_name: { type: Sequelize.STRING(191), allowNull: true },
      invoice_total: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      already_paid: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      pending_balance: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      allocated_amount: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      has_issue: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      issue_comment: { type: Sequelize.TEXT, allowNull: true },
    });
    await queryInterface.addIndex('payment_allocations', ['payment_id']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('payment_allocations');
  },
};
