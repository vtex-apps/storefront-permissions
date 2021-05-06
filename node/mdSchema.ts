export default {
  properties: {
    orderId: {
      type: 'string',
      title: 'The orderId',
    },
    order: {
      type: ['null', 'object'],
      title: 'Order',
    },
    user: {
      type: ['null', 'object'],
      title: 'User',
    },
    complete: {
      type: 'boolean',
      title: 'Is complete',
      default: false,
    },
    error: {
      type: 'string',
      title: '',
    },
    errorCount: {
      type: ['null', 'integer'],
      title: '',
      default: 0,
    },
    steps: {
      type: 'array',
      title: 'Steps',
      default: [
        {
          name: 'SaleRequest',
          complete: false,
          date: '',
          error: '',
          data: null,
        },
        {
          name: 'CreateSale',
          complete: false,
          date: '',
          error: '',
          data: null,
        },
        {
          name: 'GetCustomer',
          complete: false,
          date: '',
          error: '',
          data: null,
        },
        {
          name: 'GetProductItem',
          complete: false,
          date: '',
          error: '',
          data: null,
        },
        {
          name: 'CreateSaleLine',
          complete: false,
          date: '',
          error: '',
          data: null,
        },
        {
          name: 'UpdateSale',
          complete: false,
          date: '',
          error: '',
          data: null,
        },
      ],
    },
  },
  'v-indexed': ['orderId', 'complete', 'errorCount'],
  'v-cache': false,
}
