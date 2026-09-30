import { expect, test, vi } from "vitest";
import { createItemsController } from "../src/controllers/items";

test("item controller uses an injected repository for CRUD", async () => {
  const item = {
    id: "123e4567-e89b-42d3-a456-426614174000",
    title: "Example",
    description: "",
    created_at: "2026-09-30T00:00:00.000Z",
    updated_at: "2026-09-30T00:00:00.000Z",
  };
  const repository = {
    list: vi.fn().mockResolvedValue([item]),
    create: vi.fn().mockResolvedValue(item),
    get: vi.fn().mockResolvedValue(item),
    replace: vi.fn().mockResolvedValue(item),
    delete: vi.fn().mockResolvedValue(true),
  };
  const controller = createItemsController(repository, () => item.id);

  expect(await controller.list()).toEqual({ items: [item] });
  expect(await controller.create({ title: "Example", description: "" })).toEqual({
    item,
    location: `/api/items/${item.id}`,
  });
  expect(repository.create).toHaveBeenCalledWith(item.id, { title: "Example", description: "" });
  expect(await controller.get(item.id)).toEqual({ item });
  expect(await controller.replace(item.id, { title: "Example", description: "" })).toEqual({
    item,
  });
  expect(await controller.delete(item.id)).toBe(true);

  repository.get.mockResolvedValueOnce(null);
  repository.replace.mockResolvedValueOnce(null);
  repository.delete.mockResolvedValueOnce(false);
  expect(await controller.get(item.id)).toBeNull();
  expect(await controller.replace(item.id, { title: "Example", description: "" })).toBeNull();
  expect(await controller.delete(item.id)).toBe(false);
});
