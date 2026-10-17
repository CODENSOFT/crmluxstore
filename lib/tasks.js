const POP = [["assignedTo", "name email"], ["createdBy", "name"], ["customer", "name phone"], ["order", "number"]];

export const populateTask = (q) => POP.reduce((acc, [p, s]) => acc.populate(p, s), q);
