'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('issue_comments', {
      id: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false, defaultValue: Sequelize.UUIDV4 },
      issue_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
        references: { model: 'document_issues', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      author_name: { type: Sequelize.STRING(191), allowNull: false },
      author_role: { type: Sequelize.STRING(128), allowNull: true },
      comment: { type: Sequelize.TEXT, allowNull: false },
      type: {
        type: Sequelize.ENUM('WORK_NOTE', 'REVIEWER_NOTE', 'RESOLUTION_NOTE'),
        allowNull: false,
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('issue_comments', ['issue_id']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('issue_comments');
  },
};
