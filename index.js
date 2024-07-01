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
    fs.writeFileSync('gastos.json', JSON.stringify(gastos, null, 2), 'utf8');
}

if (!fs.existsSync('roommates.json')) {
    const roommates = { "roommates": [] };
    fs.writeFileSync('roommates.json', JSON.stringify(roommates, null, 2), 'utf8');
}

//RUTA PÁGINA PRINCIPAL
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, './public/index.html'));
});

// ENDPOINTS
// Almacenar nuevo roommate usando random user
app.post('/roommate', async (req, res) => {
    try {
        const getUser = async () => {
            try {
                const { data } = await axios.get('https://randomuser.me/api');
                const usuario = data.results[0]
                const id = uuidv4().slice(0, 6);
                const roommate = { id: id, nombre: usuario.name.first, apellido: usuario.name.last, email: usuario.email };
                const dataRoommate = JSON.parse(fs.readFileSync('roommates.json', 'utf8'));
                if (!Array.isArray(dataRoommate.roommates)) {
                    dataRoommate.roommates = [];
                }
                dataRoommate.roommates.push(roommate);
                fs.writeFileSync('roommates.json', JSON.stringify(dataRoommate, null, 2));
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
app.post('/gasto', async (req, res) => {
    try {
        const { roommate, descripcion, monto } = req.body
        const id = uuidv4().slice(0, 6);
        console.log(req.body);
        log('** Roommate: ', roommate, 'descripcion: ', descripcion, 'monto: ', monto);
        const gasto = { id, roommate, descripcion, monto };
        const data = JSON.parse(fs.readFileSync('gastos.json', 'utf8'));
        if (!Array.isArray(data.gastos)) {
            data.gastos = [];
        }
        data.gastos.push(gasto);
        fs.writeFileSync('gastos.json', JSON.stringify(data, null, 2));
        log('Nuevo gasto almacenado con éxito.')
        res.status(201).json(gasto)
    } catch (error) {
        res.status(500).json({ message: 'Error al almacenar nuevo gasto.', error: error.message });
    }
});

// Elimina un gasto del historial
app.delete('/gasto', (req, res) => {
    const { id } = req.query;
    if (id) {
        const data = JSON.parse(fs.readFileSync('gastos.json', 'utf8'));
        const gastos = data.gastos
        const index = gastos.findIndex(g => g.id === id)
        if (index !== -1) {
            try {
                gastos.splice(index, 1)
                fs.writeFileSync('gastos.json', JSON.stringify(data, null, 2));
                res.status(200).json({message: `Gasto eliminado con éxito.`});
            } catch (error) {
                res.status(500).json({message: 'Error al eliminar el gasto.'});
            }
        } else {
            res.status(400).json({message: 'Gasto no encontrado o no proporcionado.'});
        }
    }
});

app.all('*', (req, res) => {
    res.send('Página no encontrada.')
});

app.listen(port, () => {
    log(`Servidor ejecutándose en puerto ${port}.`)
});