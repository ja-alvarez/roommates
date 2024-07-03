import express from 'express';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const log = console.log;
const port = 3000;

// MIDDLEWARES GENERALES
app.use(express.json());
app.use(morgan("tiny"));
app.use(express.urlencoded({ extended: true }));

//DEJAR PÚBLICA LA CARPETA PUBLIC
app.use(express.static('public'));

if (!fs.existsSync('gastos.json')) {
    const gastos = { "gastos": [] };
    fs.writeFileSync('gastos.json', JSON.stringify(gastos, null, 4), 'utf8');
}

if (!fs.existsSync('roommates.json')) {
    const roommates = { "roommates": [] };
    fs.writeFileSync('roommates.json', JSON.stringify(roommates, null, 4), 'utf8');
}

//RUTA PÁGINA PRINCIPAL
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, './public/index.html'));
});

const actualizarDebeRecibe = async () => {
    const dataGastos = JSON.parse(fs.readFileSync('gastos.json', 'utf8'));
    const dataRoommates = JSON.parse(fs.readFileSync('roommates.json', 'utf8'));
    const ultimoGasto = dataGastos.gastos[dataGastos.gastos.length - 1];
    const responsablePago = ultimoGasto.roommate;
    const montoPorPersona = ultimoGasto.monto / dataRoommates.roommates.length;
    dataRoommates.roommates.forEach(roommate => {
        if (roommate.nombre === responsablePago) {
            roommate.recibe += (montoPorPersona * (dataRoommates.roommates.length - 1));
        } else {
            roommate.debe += montoPorPersona;
        }
        if (roommate.debe > roommate.recibe) {
            roommate.debe -= roommate.recibe;
            roommate.recibe = 0;
        } else {
            roommate.recibe -= roommate.debe;
            roommate.debe = 0;
        }
    });
    fs.writeFileSync('roommates.json', JSON.stringify(dataRoommates, null, 4));
};

// ENDPOINTS
// Almacenar nuevo roommate usando random user
app.post('/roommate', async (req, res) => {
    try {
        const getUser = async () => {
            try {
                const { data } = await axios.get('https://randomuser.me/api');
                const usuario = data.results[0]
                const id = uuidv4().slice(0, 6);
                const roommate = { id: id, nombre: usuario.name.first, apellido: usuario.name.last, email: usuario.email, debe: 0, recibe: 0 };
                const dataRoommate = JSON.parse(fs.readFileSync('roommates.json', 'utf8'));
                if (!Array.isArray(dataRoommate.roommates)) {
                    dataRoommate.roommates = [];
                }
                dataRoommate.roommates.push(roommate);
                fs.writeFileSync('roommates.json', JSON.stringify(dataRoommate, null, 4));
                log('Nuevo roommate almacenado con éxito.')
                return roommate;
            } catch (error) {
                console.error(error);
                throw error;
            }
        }
        const newRoommate = await getUser();
        res.status(201).json({ message: 'Nuevo roommate almacenado con éxito', roommate: newRoommate });
    } catch (error) {
        res.status(500).json({ message: 'Error al almacenar el nuevo roommate', error: error.message });
    }
});

// Devolver todos los roommates almacenados
app.get('/roommates', async (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync('roommates.json', 'utf8'));
        res.json(data);
    } catch (error) {
        const message = error.message
        res.status(400).json({ message })
    }
});

// Devuelve los gastos registrados en gastos.json
app.get('/gastos', async (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync('gastos.json', 'utf8'));
        res.json(data);
    } catch (error) {
        res.status(400).json({ message: 'Error al leer el archivo de gastos', error: error.message });
    }
});

// Recibe el payload con los datos del gasto y almacena en gastos.json
// HISTORIAL
app.post('/gasto', async (req, res) => {
    try {
        const { roommate, descripcion, monto } = req.body
        const id = uuidv4().slice(0, 6);
        log('** Roommate: ', roommate, 'descripcion: ', descripcion, 'monto: ', monto);
        const gasto = { id, roommate, descripcion, monto };
        const data = JSON.parse(fs.readFileSync('gastos.json', 'utf8'));
        if (!Array.isArray(data.gastos)) {
            data.gastos = [];
        }
        data.gastos.push(gasto);
        fs.writeFileSync('gastos.json', JSON.stringify(data, null, 4));
        actualizarDebeRecibe();
        log('Nuevo gasto almacenado con éxito.')
        res.status(201).json(gasto)
    } catch (error) {
        res.status(500).json({ message: 'Error al almacenar nuevo gasto.', error: error.message });
    }
});

//Endpoint pendiente de implementar:
//Editar datos de un gasto
app.put('/gasto', (req, res) => {
    const id = req.query;
    console.log('************** id', id) // id del gasto!
});

// Elimina un gasto del historial
/* 
Nota: hay un bug: Al eliminar un gasto, se actualiza el "debe" y "recibe" de los roommates correctamente solo si los roommates son los mismos que había al crearse el gasto. Esto se debe a que, al "revertir" el debe y el recibe, el monto se divide por la cantidad de usuarios actuales, sin garantía de que estos sean los mismos que estaban presentes cuando se creó el gasto originalmente.

Posibles soluciones para mejorar el código podrían ser:
- crear otro JSON que establezca las relaciones entre cada gasto y los roommates involucrados en ese momento. 
- Implementar una base de datos para manejar las relaciones y actualizaciones de manera más confiable. Esto permitirá mantener la integridad de los datos y realizar consultas complejas.

El codigo se puede refactorizar, la parte del endpoint que modifica "debe y recibe" es muy similar a la funcion 'actualizarDebeRecibe();'
*/ 
app.delete('/gasto', async (req, res) => {
    const { id } = req.query;
    if (id) {
        const dataGastos = JSON.parse(fs.readFileSync('gastos.json', 'utf8'));
        const dataRoommates = JSON.parse(fs.readFileSync('roommates.json', 'utf8')); // **
        const gastos = dataGastos.gastos
        const index = gastos.findIndex(g => g.id === id)
        if (index !== -1) {
            const gastoEliminado = gastos[index];
            const responsablePago = gastoEliminado.roommate;
            const montoPago = gastoEliminado.monto/dataRoommates.roommates.length;
            console.log('Responsable pago delete:', responsablePago);
            try {
                gastos.splice(index, 1)
                fs.writeFileSync('gastos.json', JSON.stringify(dataGastos, null, 4));
                dataRoommates.roommates.forEach(roommate => {
                    if (roommate.nombre === responsablePago) {
                        roommate.recibe -= (montoPago * (dataRoommates.roommates.length - 1));
                    } else {
                        roommate.debe -= montoPago;
                    }
                    if (roommate.debe > roommate.recibe) {
                        roommate.debe += roommate.recibe;
                        roommate.recibe = 0;
                    } else {
                        roommate.recibe += roommate.debe;
                        roommate.debe = 0;
                    }
                })
                fs.writeFileSync('roommates.json', JSON.stringify(dataRoommates, null, 4));
                res.status(200).json({ message: `Gasto eliminado con éxito.` });
            } catch (error) {
                res.status(500).json({ message: 'Error al eliminar el gasto.' });
            }
        } else {
            res.status(400).json({ message: 'Gasto no encontrado o no proporcionado.' });
        }
    }
});

app.all('*', (req, res) => {
    res.send('Página no encontrada.')
});

app.listen(port, () => {
    log(`Servidor ejecutándose en puerto ${port}.`)
});