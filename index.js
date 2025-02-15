import express from 'express';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import fs from 'fs';
import nodemailer from 'nodemailer';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const log = console.log;
const port = 3000;

// MIDDLEWARES GENERALES
app.use(express.json());
app.use(morgan('tiny'));
app.use(express.urlencoded({ extended: true }));

//DEJAR PÚBLICA LA CARPETA PUBLIC
app.use(express.static('public'));

// Crea el transporte de correo
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: '', // Falta ingresar email y contraseñas válidos
        pass: '', //pass
    },
});

if (!fs.existsSync('gastos.json')) {
    const gastos = { 'gastos': [] };
    fs.writeFileSync('gastos.json', JSON.stringify(gastos, null, 4), 'utf8');
}

if (!fs.existsSync('roommates.json')) {
    const roommates = { 'roommates': [] };
    fs.writeFileSync('roommates.json', JSON.stringify(roommates, null, 4), 'utf8');
}

//RUTA PÁGINA PRINCIPAL
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, './public/index.html'));
});

const dividirCuentas = async () => {
    const dataGastos = JSON.parse(fs.readFileSync('gastos.json', 'utf8'));
    const dataRoommates = JSON.parse(fs.readFileSync('roommates.json', 'utf8'));
    // reinicia deudas y recibos
    dataRoommates.roommates.forEach(roommate => {
        roommate.debe = 0;
        roommate.recibe = 0;
    });
    dataGastos.gastos.forEach(gasto => {
        const montoPorPersona = gasto.monto / dataRoommates.roommates.length;
        dataRoommates.roommates.forEach(roommate => {
            if (roommate.nombre === gasto.roommate) {
                roommate.recibe += montoPorPersona * (dataRoommates.roommates.length - 1);
            } else {
                roommate.debe += montoPorPersona;
            }
        });
    });
    dataRoommates.roommates.forEach(roommate => {
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
app.post('/gasto', async (req, res) => {
    try {
        const { roommate, descripcion, monto } = req.body
        if (!roommate || !descripcion || !monto) {
            return res.status(400).json({ message: 'Datos faltantes en la solicitud.' });
        }
        const id = uuidv4().slice(0, 6);
        const gasto = { id, roommate, descripcion, monto };
        const data = JSON.parse(fs.readFileSync('gastos.json', 'utf8'));  //borré await
        if (!Array.isArray(data.gastos)) {
            data.gastos = [];
        }
        data.gastos.push(gasto);
        fs.writeFileSync('gastos.json', JSON.stringify(data, null, 4));
        await dividirCuentas();
        // Define las opciones del correo electrónico
        const dataRoommates = JSON.parse(fs.readFileSync('roommates.json', 'utf8')); //await
        const emails = dataRoommates.roommates.map(roommate => roommate.email);
        const emailList = emails.join(', ');
        const mailOptions = {
            from: 'pruebasjsdev@gmail.com',
            to: emailList, //Corregir
            subject: 'Nuevo gasto',
            text: `Se ha registrado un nuevo gasto:\nID: ${id}\nRoommate: ${roommate}\nDescripción: ${descripcion}\nMonto: ${monto}`
        };
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log('Error al enviar el correo:', error);
                res.status(500).json({ message: 'Error al enviar el correo electrónico', error: error.message });
            } else {
                console.log('Correo electrónico enviado: ' + info.response);
                res.status(200).json({ message: 'Correo electrónico enviado correctamente.' });
            }
        });
        res.status(201).json(gasto)
    } catch (error) {
        res.status(500).json({ message: 'Error al almacenar nuevo gasto.', error: error.message });
    }
});

//Editar datos de un gasto
app.put('/gasto', async (req, res) => {
    const { id } = req.query;
    const { monto, descripcion, roommate } = req.body;
    if (!id) {
        return res.status(400).json({ message: 'ID del gasto no proporcionado.' });
    }
    try {
        const dataGastos = JSON.parse(fs.readFileSync('gastos.json', 'utf8'));
        const dataRoommates = JSON.parse(fs.readFileSync('roommates.json', 'utf8'));
        const gastos = dataGastos.gastos;
        const index = gastos.findIndex(g => g.id === id);
        if (index === -1) {
            return res.status(404).json({ message: 'Gasto no encontrado.' });
        }
        const gasto = gastos[index];
        const montoAnterior = gasto.monto;
        const roommateAnterior = gasto.roommate;
        if (monto !== undefined) gasto.monto = monto;
        if (descripcion !== undefined) gasto.descripcion = descripcion;
        if (roommate !== undefined) gasto.roommate = roommate;
        fs.writeFileSync('gastos.json', JSON.stringify({ gastos }, null, 4));
        const montoPorPersonaAnterior = montoAnterior / dataRoommates.roommates.length;
        const montoPorPersonaNuevo = gasto.monto / dataRoommates.roommates.length;
        dataRoommates.roommates.forEach(roommateItem => {
            if (roommateItem.nombre === roommateAnterior) {
                roommateItem.recibe -= montoPorPersonaAnterior * (dataRoommates.roommates.length - 1);
            } else {
                roommateItem.debe -= montoPorPersonaAnterior;
            }
            if (roommateItem.nombre === gasto.roommate) {
                roommateItem.recibe += montoPorPersonaNuevo * (dataRoommates.roommates.length - 1);
            } else {
                roommateItem.debe += montoPorPersonaNuevo;
            }
        });
        dataRoommates.roommates.forEach(roommate => {
            if (roommate.debe > roommate.recibe) {
                roommate.debe -= roommate.recibe;
                roommate.recibe = 0;
            } else {
                roommate.recibe -= roommate.debe;
                roommate.debe = 0;
            }
        });

        fs.writeFileSync('roommates.json', JSON.stringify({ roommates: dataRoommates.roommates }, null, 4));
        res.status(200).json({ message: 'Gasto actualizado con éxito.', gasto });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar el gasto.', error: error.message });
    }
});

// Elimina un gasto del historial
app.delete('/gasto', async (req, res) => {
    const { id } = req.query;
    if (id) {
        try {
            const dataGastos = JSON.parse(fs.readFileSync('gastos.json', 'utf8'));
            const dataRoommates = JSON.parse(fs.readFileSync('roommates.json', 'utf8')); // **
            const gastos = dataGastos.gastos
            const index = gastos.findIndex(g => g.id === id)
            if (index !== -1) {
                const gastoEliminado = gastos[index];
                const responsablePago = gastoEliminado.roommate;
                const montoPago = gastoEliminado.monto / dataRoommates.roommates.length;
                console.log('Responsable pago delete:', responsablePago);
                gastos.splice(index, 1);
                fs.writeFileSync('gastos.json', JSON.stringify({ gastos }, null, 4));
                dataRoommates.roommates.forEach(roommate => {
                    if (roommate.nombre === responsablePago) {
                        roommate.recibe -= (montoPago * (dataRoommates.roommates.length - 1));
                    } else {
                        roommate.debe -= montoPago;
                    }
                    if (roommate.debe > roommate.recibe) {
                        roommate.debe -= roommate.recibe;
                        roommate.recibe = 0;
                    } else {
                        roommate.recibe -= roommate.debe;
                        roommate.debe = 0;
                    }
                });
                fs.writeFileSync('roommates.json', JSON.stringify({ roommates: dataRoommates.roommates }, null, 4));
                await dividirCuentas();
                res.status(200).json({ message: 'Gasto eliminado con éxito.' });
            } else {
                res.status(404).json({ message: 'Gasto no encontrado.' });
            }
        } catch (error) {
            res.status(500).json({ message: 'Error al eliminar el gasto.', error: error.message });
        }
    } else {
        res.status(400).json({ message: 'ID del gasto no proporcionado.' });
    }
});

app.all('*', (req, res) => {
    res.send('Página no encontrada.')
});

app.listen(port, () => {
    log(`Servidor ejecutándose en puerto ${port}.`)
});