'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('delivery_notes', {
      id: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
      delivery_note_number: { type: Sequelize.STRING(128), allowNull: false, unique: true },
      delivery_date: { type: Sequelize.STRING(32), allowNull: true },
      po_number: { type: Sequelize.STRING(128), allowNull: true },
      customer_name: { type: Sequelize.STRING(191), allowNull: false },
      destination: { type: Sequelize.STRING(191), allowNull: true },
      contract: { type: Sequelize.STRING(128), allowNull: true },
      po_date: { type: Sequelize.STRING(32), allowNull: true },
      carrier: { type: Sequelize.STRING(191), allowNull: true },
      vehicle_number: { type: Sequelize.STRING(64), allowNull: true },
      driver_name: { type: Sequelize.STRING(191), allowNull: true },
      received_by: { type: Sequelize.STRING(191), allowNull: true },
      subtotal_before_vat: { type: Sequelize.DECIMAL(16, 2), allowNull: true, defaultValue: 0 },
      total_vat: { type: Sequelize.DECIMAL(16, 2), allowNull: true, defaultValue: 0 },
      total_delivered_quantity: { type: Sequelize.DECIMAL(16, 3), allowNull: false, defaultValue: 0 },
      total_delivered_value: { type: Sequelize.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
      notes: { type: Sequelize.TEXT, allowNull: true },
      comment: { type: Sequelize.TEXT, allowNull: true },
      status: {
        type: Sequelize.ENUM('ACTIVE', 'CANCELLED', 'OFR', 'CALL_OF_ORDER'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      is_cancelled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      cancel_reason: { type: Sequelize.TEXT, allowNull: true },
      is_ofr: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      ofr_detail: { type: Sequelize.TEXT, allowNull: true },
      is_call_of_order: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      call_of_order_detail: { type: Sequelize.TEXT, allowNull: true },
      matched_invoice_number: { type: Sequelize.STRING(128), allowNull: true },
      is_fully_invoiced: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
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
    await queryInterface.addIndex('delivery_notes', ['po_number']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('delivery_notes');
  },
};
