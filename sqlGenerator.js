export function generateSQL(state, dialect = "mysql") {
  const { tables, relationships, enums } = state;
  let sql = "";

  if (dialect === "postgresql" && enums && enums.length > 0) {
    sql += "-- Enums\n";
    for (const en of enums) {
      if (en.values && en.values.length > 0) {
        const vals = en.values.map(v => `'${v}'`).join(", ");
        sql += `CREATE TYPE ${en.name} AS ENUM (${vals});\n\n`;
      }
    }
  }

  // Generate tables
  for (const table of tables) {
    sql += `CREATE TABLE ${table.name} (\n`;
    const fieldLines = [];

    for (const field of table.fields) {
      let line = `  ${field.name} ${field.type}`;

      if (field.primary) {
        if (dialect === "mysql") {
          // MySQL handles autoincrement with auto_increment
          if (field.increment) line += " AUTO_INCREMENT";
          line += " PRIMARY KEY";
        } else if (dialect === "postgresql") {
          // PostgreSQL primary key autoincrement is SERIAL
          if (field.increment && (field.type.toUpperCase() === "INT" || field.type.toUpperCase() === "INTEGER")) {
            line = `  ${field.name} SERIAL PRIMARY KEY`;
          } else {
            line += " PRIMARY KEY";
          }
        } else if (dialect === "sqlite") {
          line += " PRIMARY KEY";
          if (field.increment) line += " AUTOINCREMENT";
        } else if (dialect === "mssql") {
          if (field.increment) line += " IDENTITY(1,1)";
          line += " PRIMARY KEY";
        }
      } else {
        if (field.notNull) line += " NOT NULL";
        if (field.unique) line += " UNIQUE";
        if (field.default) {
          // Add default value constraint
          const defUpper = field.default.toUpperCase();
          if (defUpper === "NULL" || defUpper === "CURRENT_TIMESTAMP" || !isNaN(field.default)) {
            line += ` DEFAULT ${field.default}`;
          } else {
            line += ` DEFAULT '${field.default}'`;
          }
        }
      }
      fieldLines.push(line);
    }

    // Foreign Key constraints inside table definition for SQLite (optional)
    // For general robustness, we append ALTER TABLE statements, but we should handle dialetcs properly.
    sql += fieldLines.join(",\n");
    sql += "\n);\n\n";
  }

  // Generate relationships (ALTER TABLE ADD CONSTRAINT FOREIGN KEY)
  if (relationships && relationships.length > 0) {
    sql += "-- Relationships / Foreign Keys\n";
    for (const rel of relationships) {
      const startTable = tables.find(t => t.id === rel.startTableId);
      const startField = startTable?.fields.find(f => f.id === rel.startFieldId);
      const endTable = tables.find(t => t.id === rel.endTableId);
      const endField = endTable?.fields.find(f => f.id === rel.endFieldId);

      if (startTable && startField && endTable && endField) {
        const fkName = `fk_${startTable.name}_${startField.name}`;
        if (dialect === "sqlite") {
          sql += `-- Note: SQLite requires Foreign Keys to be defined inside CREATE TABLE. Example structure:\n`;
          sql += `-- ALTER TABLE ${startTable.name} ADD CONSTRAINT ${fkName} FOREIGN KEY (${startField.name}) REFERENCES ${endTable.name}(${endField.name});\n`;
        } else {
          sql += `ALTER TABLE ${startTable.name}\n`;
          sql += `  ADD CONSTRAINT ${fkName}\n`;
          sql += `  FOREIGN KEY (${startField.name}) REFERENCES ${endTable.name}(${endField.name});\n\n`;
        }
      }
    }
  }

  return sql || "-- Herhangi bir tablo veya ilişki bulunmuyor.";
}
