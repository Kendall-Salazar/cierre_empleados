# cierre_empleados actualizado

Esta versión reemplaza el flujo local por un backend central con:

- autenticación con sesión y roles (`employee`, `supervisor`, `admin`)
- cierres editables por empleado por 24 horas
- revisión documental por supervisor/admin
- soporte de adjuntos por cierre
- importación de Gaspro (`general` y `detailed`)
- conciliación guardada en base de datos
- exportación CSV y exportación mensual a Excel por plantilla

## Variables nuevas

- `ADMIN_PASSWORD`
- `SUPERVISOR_PASSWORD`
- `UPLOAD_ROOT` (opcional)
- `CIERRE_TEMPLATE_PATH` (opcional, para exportar sobre plantilla mensual)
- `ALLOWED_ORIGINS` (opcional)
- `TOKEN_TTL_HOURS` (opcional)
- `EMPLOYEE_EDIT_HOURS` (opcional)

## Nota importante

La importación de Gaspro espera un CSV/XLSX con columnas equivalentes a:

- fecha
- empleado
- turno (opcional)
- producto
- litros
- monto
- ppu (opcional, pero recomendado)

## Empuje sugerido

```bash
git checkout -b feature/auditoria-cierres
cp -r /ruta/a/estos/archivos/* .
git add .
git commit -m "Implementa roles, auditoría y conciliación de cierres"
git push origin feature/auditoria-cierres
```
