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
const print = console.log;
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
app.post('/roommate', async (req, res) => {
    try {
        const getUser = async () => {
            try {
                const response = await axios.get('https://randomuser.me/api');
                const usuario = response.data.results[0]
                const id = uuidv4().slice(0, 6);
                //log(usuario.name.first, usuario.name.last)
                const roommate = { id: id, nombre: usuario.name.first, apellido: usuario.name.last };
                const data = JSON.parse(fs.readFileSync('roommates.json', 'utf8'));
                if (!Array.isArray(data.roommates)) {
                    data.roommates = [];
                }
                data.roommates.push(roommate);
                fs.writeFileSync('roommates.json', JSON.stringify(data, null, 2));
                log('Nuevo roommate almacenado con éxito.')
                print('Hola Mundo!')
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

app.get('/roommates', async (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync('roommates.json', 'utf8'));
        res.json(data);
        //res.json
    } catch (error) {
        const message = error.message
        res.status(400).json({ message })
    }
});

app.post('/gasto', async (roommate, descripcion, monto) => {
    try {


        const gasto = { roommateSelected: roommate, descripcion, monto };
        const data = JSON.parse(fs.readFileSync('gastos.json', 'utf8'));
        if (!Array.isArray(data.gasto)) {
            data.gastos = [];
        }
        data.gastos.push(gasto);
        fs.writeFileSync('roommates.json', JSON.stringify(data, null, 2));
        log('Nuevo gasto almacenado con éxito.')
        res.status(201).json(data)



    } catch (error) {
        res.send(error)
    }
});



app.all('*', (req, res) => {
    res.send('Página no encontrada.')
});

app.listen(port, () => {
    log(`Servidor ejecutándose en puerto ${port}.`)
});