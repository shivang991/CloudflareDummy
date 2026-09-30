import type { ItemInput, ItemsRepository } from "../repositories/items";

export function createItemsController(
  repository: ItemsRepository,
  newId = () => crypto.randomUUID(),
) {
  return {
    async list() {
      return { items: await repository.list() };
    },
    async create(input: ItemInput) {
      const id = newId();
      return { item: await repository.create(id, input), location: `/api/items/${id}` };
    },
    async get(id: string) {
      const item = await repository.get(id);
      return item ? { item } : null;
    },
    async replace(id: string, input: ItemInput) {
      const item = await repository.replace(id, input);
      return item ? { item } : null;
    },
    async delete(id: string) {
      return repository.delete(id);
    },
  };
}
