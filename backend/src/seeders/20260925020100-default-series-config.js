'use strict';

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    await queryInterface.bulkInsert('series_config', [
      {
        series_type: 'invoice',
        prefix: 'INV-',
        start_number: 1,
        end_number: 600,
        current_number: 1,
        padding: 3,
        auto_increment: true,
        updated_at: now,
      },
      {
        series_type: 'delivery',
        prefix: 'DN-',
        start_number: 1,
        end_number: 600,
        current_number: 1,
        padding: 3,
        auto_increment: true,
        updated_at: now,
      },
    ]);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('series_config', null, {});
  },
};
