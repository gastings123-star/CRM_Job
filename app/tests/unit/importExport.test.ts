import { describe, expect, it } from 'vitest';
import {
  buildBackup,
  parseBackup,
  parseEmployeesXlsx,
  employeesToXlsxBytes,
  employeesToCsv,
  employeeToRow,
} from '@/infra/importExport';
import { EmployeeSchema } from '@/data/schema';
import * as XLSX from 'xlsx';

function emp(overrides: Partial<{ id: string; fullName: string; role: string }>) {
  return EmployeeSchema.parse({
    id: overrides.id ?? 'e1',
    fullName: overrides.fullName ?? 'Иван',
    role: overrides.role ?? 'dev',
    team: '',
    grade: 'Junior',
    load: {},
  });
}

describe('buildBackup / parseBackup', () => {
  it('круговая упаковка-распаковка сохраняет сотрудников и команды', () => {
    const blob = buildBackup({
      schemaVersion: 2,
      employees: [emp({ id: 'e1', fullName: 'A' }), emp({ id: 'e2', fullName: 'B' })],
      teams: [{ id: 't1', name: 'Alpha', color: '#fff' }],
      projects: [],
      personal: null,
    });
    const text = JSON.stringify(blob);
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.blob?.employees).toHaveLength(2);
    expect(parsed.blob?.teams).toHaveLength(1);
  });

  it('возвращает ошибку при битом JSON', () => {
    const parsed = parseBackup('{not json');
    expect(parsed.ok).toBe(false);
    expect(parsed.errors[0]).toMatch(/JSON parse/);
  });

  it('отбраковывает невалидных сотрудников, валидные сохраняет', () => {
    const text = JSON.stringify({
      schemaVersion: 2,
      employees: [emp({ id: 'e1' }), { not: 'an employee' }],
      teams: [],
      projects: [],
    });
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(false);
    expect(parsed.blob?.employees).toHaveLength(1);
    expect(parsed.errors.some((s) => s.startsWith('employee:'))).toBe(true);
  });
});

describe('xlsx import/export', () => {
  it('employeeToRow содержит ключевые колонки', () => {
    const row = employeeToRow(emp({ id: 'e1', fullName: 'A', role: 'dev' }));
    expect(row['ФИО']).toBe('A');
    expect(row['Роль']).toBe('dev');
    expect(row).toHaveProperty('id', 'e1');
  });

  it('round-trip: экспорт → парсинг возвращает корректные строки', () => {
    const buf = employeesToXlsxBytes([
      emp({ id: 'e1', fullName: 'Анна', role: 'dev' }),
      emp({ id: 'e2', fullName: 'Борис', role: 'qa' }),
    ]);
    const report = parseEmployeesXlsx(buf);
    expect(report.total).toBe(2);
    expect(report.valid).toBe(2);
    expect(report.rows[0]?.candidate?.fullName).toBe('Анна');
    expect(report.rows[1]?.candidate?.fullName).toBe('Борис');
  });

  it('отмечает строки с пустым ФИО как невалидные', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        { 'ФИО': 'Анна', 'Роль': 'dev' },
        { 'ФИО': '', 'Роль': 'qa' },
      ]),
      'Employees',
    );
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const report = parseEmployeesXlsx(buf);
    expect(report.total).toBe(2);
    expect(report.valid).toBe(1);
    expect(report.invalid).toBe(1);
    expect(report.rows[1]?.errors).toContain('Пустое ФИО');
  });
});

describe('employeesToCsv', () => {
  it('возвращает шапку и строку UTF-8 c BOM', () => {
    const csv = employeesToCsv([emp({ fullName: 'Анна', role: 'QA' })]);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toContain('ФИО');
    expect(lines[0]).toContain('Роль');
    expect(lines[1]).toContain('Анна');
    expect(lines[1]).toContain('QA');
  });

  it('эскейпит ;, кавычки и переносы строк', () => {
    const csv = employeesToCsv([
      emp({ fullName: 'Сидо; ров', role: 'Лид "ноль"' }),
    ]);
    const lines = csv.slice(1).split('\r\n');
    // Поле «Сидо; ров» должно попасть в кавычки.
    expect(lines[1]).toContain('"Сидо; ров"');
    // «Лид "ноль"» → "Лид ""ноль"""
    expect(lines[1]).toContain('"Лид ""ноль"""');
  });

  it('пустой массив → пустая строка', () => {
    expect(employeesToCsv([])).toBe('');
  });
});
