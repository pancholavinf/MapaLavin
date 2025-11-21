const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function queryDatabase(query, params = []) {
    const client = await pool.connect();
    try {
        const result = await client.query(query, params);
        return result.rows;
    } finally {
        client.release();
    }
}

async function generate() {
    console.log('Iniciando la generación de datos...');

    // Crear directorios necesarios
    await fs.mkdir(path.join(__dirname, 'api', 'resultados', 'mapa'), { recursive: true });
    await fs.mkdir(path.join(__dirname, 'api', 'resultados', 'pais'), { recursive: true });
    await fs.mkdir(path.join(__dirname, 'api', 'resultados', 'region'), { recursive: true });
    await fs.mkdir(path.join(__dirname, 'api', 'estadisticas', 'pais'), { recursive: true });
    await fs.mkdir(path.join(__dirname, 'api', 'estadisticas', 'region'), { recursive: true });
    await fs.mkdir(path.join(__dirname, 'api', 'candidatos'), { recursive: true });

    // 1. Obtener todas las elecciones
    const elecciones = await queryDatabase('SELECT * FROM elecciones');
    await fs.writeFile(path.join(__dirname, 'api', 'elecciones.json'), JSON.stringify(elecciones, null, 2));
    console.log('✓ Generado elecciones.json');

    // 2. Iterar por cada elección para generar sus datos
    for (const eleccion of elecciones) {
        const idEleccion = eleccion.id_eleccion;
        console.log(`  Generando datos para la elección: ${idEleccion}`);

        // Resultados para el mapa
        const mapaData = await queryDatabase(`
            WITH VotosPorRegion AS (
                SELECT rcr.id_region, ca.id_candidato, c.nombre_completo, ca.color_hex, SUM(rcr.cantidad_votos) AS total_votos,
                       ROW_NUMBER() OVER(PARTITION BY rcr.id_region ORDER BY SUM(rcr.cantidad_votos) DESC) as rn
                FROM resultados_candidatos_region rcr
                JOIN candidaturas ca ON rcr.id_candidatura = ca.id_candidatura
                JOIN candidatos c ON ca.id_candidato = c.id_candidato
                WHERE ca.id_eleccion = $1 GROUP BY rcr.id_region, ca.id_candidato, c.nombre_completo, ca.color_hex
            )
            SELECT id_region, nombre_completo AS ganador, color_hex FROM VotosPorRegion WHERE rn = 1;
        `, [idEleccion]);
        await fs.writeFile(path.join(__dirname, 'api', 'resultados', 'mapa', `${idEleccion}.json`), JSON.stringify(mapaData, null, 2));

        // Resultados país
        const paisData = await queryDatabase(`
            SELECT c.nombre_completo, ca.color_hex, SUM(rcr.cantidad_votos) AS total_votos
            FROM resultados_candidatos_region rcr
            JOIN candidaturas ca ON rcr.id_candidatura = ca.id_candidatura
            JOIN candidatos c ON ca.id_candidato = c.id_candidato
            WHERE ca.id_eleccion = $1 GROUP BY c.nombre_completo, ca.color_hex ORDER BY total_votos DESC;
        `, [idEleccion]);
        await fs.writeFile(path.join(__dirname, 'api', 'resultados', 'pais', `${idEleccion}.json`), JSON.stringify(paisData, null, 2));

        // Estadísticas país
        const statsPais = await queryDatabase('SELECT SUM(total_electores) as total_electores, SUM(total_votantes) as total_votantes FROM estadisticas_regionales WHERE id_eleccion = $1', [idEleccion]);
        await fs.writeFile(path.join(__dirname, 'api', 'estadisticas', 'pais', `${idEleccion}.json`), JSON.stringify(statsPais[0], null, 2));

        // Información de candidatos
        const candidatosData = await queryDatabase(`
            SELECT c.nombre_completo, c.wikipedia_url, p.nombre_partido, b.nombre_bloque, b.tendencia
            FROM candidaturas ca
            JOIN candidatos c ON ca.id_candidato = c.id_candidato
            LEFT JOIN partidos p ON ca.id_partido = p.id_partido
            LEFT JOIN bloques b ON ca.id_bloque = b.id_bloque
            WHERE ca.id_eleccion = $1;
        `, [idEleccion]);
        await fs.writeFile(path.join(__dirname, 'api', 'candidatos', `${idEleccion}.json`), JSON.stringify(candidatosData, null, 2));

        // Datos por región
        const regiones = await queryDatabase('SELECT id_region FROM regiones');
        for (const region of regiones) {
            const idRegion = region.id_region;
            await fs.mkdir(path.join(__dirname, 'api', 'resultados', 'region', idEleccion.toString()), { recursive: true });
            await fs.mkdir(path.join(__dirname, 'api', 'estadisticas', 'region', idEleccion.toString()), { recursive: true });

            const regionData = await queryDatabase(`
                SELECT c.nombre_completo, ca.color_hex, SUM(rcr.cantidad_votos) AS total_votos
                FROM resultados_candidatos_region rcr
                JOIN candidaturas ca ON rcr.id_candidatura = ca.id_candidatura
                JOIN candidatos c ON ca.id_candidato = c.id_candidato
                WHERE ca.id_eleccion = $1 AND rcr.id_region = $2 GROUP BY c.nombre_completo, ca.color_hex ORDER BY total_votos DESC;
            `, [idEleccion, idRegion]);
            await fs.writeFile(path.join(__dirname, 'api', 'resultados', 'region', idEleccion.toString(), `${idRegion}.json`), JSON.stringify(regionData, null, 2));

            const statsRegion = await queryDatabase('SELECT total_electores, total_votantes FROM estadisticas_regionales WHERE id_eleccion = $1 AND id_region = $2', [idEleccion, idRegion]);
            await fs.writeFile(path.join(__dirname, 'api', 'estadisticas', 'region', idEleccion.toString(), `${idRegion}.json`), JSON.stringify(statsRegion[0] || {}, null, 2));
        }
    }
    console.log('✓ Generación de datos completada.');
    pool.end();
}

generate().catch(console.error);
