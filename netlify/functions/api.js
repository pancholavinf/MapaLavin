const express = require('express');
const serverless = require('serverless-http');
const { Pool } = require('pg');

const app = express();
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// --- Endpoints de Resultados y Estadísticas ---

router.get('/elecciones', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM elecciones ORDER BY fecha_eleccion DESC');
    res.json(result.rows);
    client.release();
  } catch (err) {
    console.error('Database Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/resultados/mapa/:id_eleccion', async (req, res) => {
    const { id_eleccion } = req.params;
    try {
        const client = await pool.connect();
        const query = `
            WITH VotosPorRegion AS (
                SELECT rcr.id_region, ca.id_candidato, c.nombre_completo, ca.color_hex, SUM(rcr.cantidad_votos) AS total_votos,
                       ROW_NUMBER() OVER(PARTITION BY rcr.id_region ORDER BY SUM(rcr.cantidad_votos) DESC) as rn
                FROM resultados_candidatos_region rcr
                JOIN candidaturas ca ON rcr.id_candidatura = ca.id_candidatura
                JOIN candidatos c ON ca.id_candidato = c.id_candidato
                WHERE ca.id_eleccion = $1
                GROUP BY rcr.id_region, ca.id_candidato, c.nombre_completo, ca.color_hex
            )
            SELECT id_region, nombre_completo AS ganador, color_hex FROM VotosPorRegion WHERE rn = 1;
        `;
        const result = await client.query(query, [id_eleccion]);
        res.json(result.rows);
        client.release();
    } catch (err) {
        console.error('Database Error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/resultados/:scope/:id_eleccion/:id_region?', async (req, res) => {
    const { scope, id_eleccion, id_region } = req.params;
    let query;
    const params = [id_eleccion];

    if (scope === 'pais') {
        query = `
            SELECT c.nombre_completo, ca.color_hex, SUM(rcr.cantidad_votos) AS total_votos
            FROM resultados_candidatos_region rcr
            JOIN candidaturas ca ON rcr.id_candidatura = ca.id_candidatura
            JOIN candidatos c ON ca.id_candidato = c.id_candidato
            WHERE ca.id_eleccion = $1
            GROUP BY c.nombre_completo, ca.color_hex ORDER BY total_votos DESC;
        `;
    } else {
        query = `
            SELECT c.nombre_completo, ca.color_hex, SUM(rcr.cantidad_votos) AS total_votos
            FROM resultados_candidatos_region rcr
            JOIN candidaturas ca ON rcr.id_candidatura = ca.id_candidatura
            JOIN candidatos c ON ca.id_candidato = c.id_candidato
            WHERE ca.id_eleccion = $1 AND rcr.id_region = $2
            GROUP BY c.nombre_completo, ca.color_hex ORDER BY total_votos DESC;
        `;
        params.push(id_region);
    }
    
    try {
        const client = await pool.connect();
        const result = await client.query(query, params);
        res.json(result.rows);
        client.release();
    } catch (err) {
        console.error('Database Error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/estadisticas/:scope/:id_eleccion/:id_region?', async (req, res) => {
    const { scope, id_eleccion, id_region } = req.params;
    let query;
    const params = [id_eleccion];

    if (scope === 'pais') {
        query = 'SELECT SUM(total_electores) as total_electores, SUM(total_votantes) as total_votantes FROM estadisticas_regionales WHERE id_eleccion = $1';
    } else {
        query = 'SELECT total_electores, total_votantes FROM estadisticas_regionales WHERE id_eleccion = $1 AND id_region = $2';
        params.push(id_region);
    }

    try {
        const client = await pool.connect();
        const result = await client.query(query, params);
        res.json(result.rows[0]);
        client.release();
    } catch (err) {
        console.error('Database Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- NUEVO Endpoint de Candidatos ---
router.get('/candidatos/:id_eleccion', async (req, res) => {
    const { id_eleccion } = req.params;
    try {
        const client = await pool.connect();
        const query = `
            SELECT 
                c.nombre_completo,
                c.wikipedia_url,
                p.nombre_partido,
                b.nombre_bloque,
                b.tendencia
            FROM candidaturas ca
            JOIN candidatos c ON ca.id_candidato = c.id_candidato
            LEFT JOIN partidos p ON ca.id_partido = p.id_partido
            LEFT JOIN bloques b ON ca.id_bloque = b.id_bloque
            WHERE ca.id_eleccion = $1;
        `;
        const result = await client.query(query, [id_eleccion]);
        res.json(result.rows);
        client.release();
    } catch (err) {
        console.error('Database Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.use('/api', router);
module.exports.handler = serverless(app);