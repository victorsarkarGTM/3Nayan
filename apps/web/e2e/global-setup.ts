import { TEST_PHONES, deleteUserByPhone } from './helpers';

/** Start every run with fresh test-number accounts. */
export default async function globalSetup() {
  for (const phone of TEST_PHONES) await deleteUserByPhone(phone);
}
