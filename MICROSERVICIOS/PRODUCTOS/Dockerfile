# Es la version del node.js que vamos a utilizar para el proyecto!
FROM node:22.19.0-slim

# El directorio de almacenamiento dentro de la imagen del contenedor!
WORKDIR /producto-microservice

# Copiamos los archivos con las dependencias
COPY package*.json .

# Y ponemos el comando para la instalacion de las mismas. 
RUN npm install 

# Lo que le decimos aca es, copie todo lo que esta en la carpeta src/ a una nueva carpeta
# dentro de mi directorio de trabajo (producto-microservice) 
COPY src/ ./src/

# Exponemos el puerto 3002 que es donde corre este microservicio. 
EXPOSE 3002

# Usare el ENTRYPOINT ya que no necesito que se ejecute otra instruccion, entonces, garantizo
# Que no se sobreescriba la instruccion node al dejar solo el parametro CMD
ENTRYPOINT [ "node" ]

# En cmd pongo la ruta del ejecutable, que como hice anteriormente se creo dentro de mi workdir
# en el directorio src
CMD ["src/index.js"]

# Para la compilacion use el siguiente comando: 
# docker build -t juanesklk/producto-microservice:v1 .