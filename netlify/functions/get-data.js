const { Pool } = require('pg');

// La URL de la base de datos se obtiene de las variables de entorno.
// netlify dev cargará esta variable desde tu configuración en Netlify o desde un archivo .env
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("La variable de entorno DATABASE_URL no está definida.");
}

const pool = new Pool({
  connectionString,
  // Neon requiere SSL, y esta configuración es común para evitar errores de certificados.
  ssl: {
    rejectUnauthorized: false,
  },
});

exports.handler = async (event, context) => {
  try {
    const client = await pool.connect();

    // --- ¡IMPORTANTE! ---
    // Reemplaza 'nombre_de_tu_tabla' con el nombre real de la tabla que quieres consultar.
    const result = await client.query('SELECT * FROM nombre_de_tu_tabla LIMIT 10;');
    
    client.release(); // Libera el cliente para que otros puedan usar la conexión.

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result.rows),
    };
  } catch (error) {
    console.error('Error al conectar o consultar la base de datos:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'No se pudo conectar a la base de datos.', details: error.message }),
    };
  }
};