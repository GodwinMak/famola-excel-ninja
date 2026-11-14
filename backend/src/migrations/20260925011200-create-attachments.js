'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('attachments', {
      id: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(255), allowNull: false },
      url: { type: Sequelize.STRING(512), allowNull: false },
      size: { type: Sequelize.INTEGER, allowNull: true },
      mime_type: { type: Sequelize.STRING(128), allowNull: true },
      uploaded_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      uploaded_by: { type: Sequelize.STRING(191), allowNull: true },
      caption: { type: Sequelize.TEXT, allowNull: true },
      owner_type: {
        type: Sequelize.ENUM('INVOICE', 'DELIVERY_NOTE', 'ISSUE_COMMENT'),
        allowNull: true,
      },
      owner_id: { type: Sequelize.STRING(64), allowNull: true },
    });
    await queryInterface.addIndex('attachments', ['owner_type', 'owner_id']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('attachments');
  },
};
