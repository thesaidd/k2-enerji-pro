import { db } from './database';
import type { Customer } from '../../types';

export const CustomerRepository = {
  list: (): Promise<Customer[]> => db.customers.orderBy('updatedAt').reverse().toArray(),
  get: (id: string): Promise<Customer | undefined> => db.customers.get(id),
  save: async (customer: Customer): Promise<Customer> => {
    await db.customers.put(structuredClone(customer));
    return customer;
  },
  saveMany: async (customers: Customer[]): Promise<void> => {
    await db.customers.bulkPut(structuredClone(customers));
  },
};
