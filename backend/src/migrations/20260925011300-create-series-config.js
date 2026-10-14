'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('series_config', {
      series_type: {
        type: Sequelize.ENUM('invoice', 'delivery'),
        primaryKey: true,
        allowNull: false,
      },
      prefix: { type: Sequelize.STRING(32), allowNull: false },
      start_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      end_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 999999 },
      current_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      padding: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 4 },
      auto_increment: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('series_config');
  },
};
