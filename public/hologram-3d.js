class Hologram3D {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.mesh = null;
    this.markerGroup = null;
    this.videoElement = null;
    this.videoTexture = null;
    this.gifAspectRatio = 1;
    this.targetPosition = { x: 0, y: 0, z: 0 };
    this.currentPosition = { x: 0, y: 0, z: 0 };
    this.targetRotation = { x: 0, y: 0, z: 0 };
    this.currentRotation = { x: 0, y: 0, z: 0 };
    this.targetScale = 1;
    this.currentScale = 1;
    this.deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };
    this.isInitialized = false;
    this.isVisible = false;

    this.init();
  }

  init() {
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.scene.fog = null;

    // Create camera
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
    this.camera.position.z = 150;

    // Create renderer with transparency
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.setClearColor(0x000000, 0);
    this.container.appendChild(this.renderer.domElement);

    // Add lighting
    this.setupLighting();

    // Create 3D mesh (placeholder)
    this.createMesh();

    // Create visual marker/border
    this.createMarker();

    // Handle resize
    window.addEventListener("resize", () => this.onWindowResize());

    // Setup device orientation
    this.setupDeviceOrientation();

    // Start animation loop
    this.animate();

    this.isInitialized = true;
  }

  setupLighting() {
    // Ambient light tuned to the warm palette.
    const ambientLight = new THREE.AmbientLight(0xddb967, 0.5);
    this.scene.add(ambientLight);

    // Directional light (main)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(100, 100, 100);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    this.scene.add(directionalLight);

    // Point light creates the hologram glow.
    const pointLight = new THREE.PointLight(0xd1603d, 0.8);
    pointLight.position.set(-150, 100, 150);
    this.scene.add(pointLight);

    // Back light - magenta accent
    const backLight = new THREE.DirectionalLight(0xff00ff, 0.15);
    backLight.position.set(-100, -50, -100);
    this.scene.add(backLight);
  }

  createMarker() {
    // Create a group for marker elements
    this.markerGroup = new THREE.Group();
    this.scene.add(this.markerGroup);

    // Create outer border/frame with glow
    const borderGeometry = new THREE.BufferGeometry();
    const borderPoints = [
      // Top line
      new THREE.Vector3(-85, 95, 0),
      new THREE.Vector3(85, 95, 0),
      // Right line
      new THREE.Vector3(85, 95, 0),
      new THREE.Vector3(85, -95, 0),
      // Bottom line
      new THREE.Vector3(85, -95, 0),
      new THREE.Vector3(-85, -95, 0),
      // Left line
      new THREE.Vector3(-85, -95, 0),
      new THREE.Vector3(-85, 95, 0),
    ];
    borderGeometry.setFromPoints(borderPoints);

    const borderMaterial = new THREE.LineBasicMaterial({
      color: 0xddb967,
      linewidth: 3,
      transparent: true,
      opacity: 0.6
    });

    const borderLine = new THREE.LineSegments(borderGeometry, borderMaterial);
    this.markerGroup.add(borderLine);

    // Add corner markers (small squares)
    const cornerSize = 12;
    const corners = [
      { x: -85, y: 95 },
      { x: 85, y: 95 },
      { x: 85, y: -95 },
      { x: -85, y: -95 }
    ];

    corners.forEach((corner) => {
      const cornerGeom = new THREE.BufferGeometry();
      const corner_size = cornerSize;
      const cornerPoints = [
        new THREE.Vector3(corner.x - corner_size, corner.y, 0),
        new THREE.Vector3(corner.x + corner_size, corner.y, 0),
        new THREE.Vector3(corner.x, corner.y - corner_size, 0),
        new THREE.Vector3(corner.x, corner.y + corner_size, 0),
      ];
      cornerGeom.setFromPoints(cornerPoints);

      const cornerMaterial = new THREE.LineBasicMaterial({
        color: 0xddb967,
        linewidth: 2,
        transparent: true,
        opacity: 0.8
      });

      const cornerLine = new THREE.LineSegments(cornerGeom, cornerMaterial);
      this.markerGroup.add(cornerLine);
    });

    // Add center crosshair
    const crossGeom = new THREE.BufferGeometry();
    const crossPoints = [
      new THREE.Vector3(-20, 0, 0),
      new THREE.Vector3(20, 0, 0),
      new THREE.Vector3(0, -20, 0),
      new THREE.Vector3(0, 20, 0),
    ];
    crossGeom.setFromPoints(crossPoints);

    const crossMaterial = new THREE.LineBasicMaterial({
      color: 0xd0e37f,
      linewidth: 1,
      transparent: true,
      opacity: 0.5
    });

    const crossLine = new THREE.LineSegments(crossGeom, crossMaterial);
    this.markerGroup.add(crossLine);
  }

  createMesh() {
    // Create initial placeholder plane (will be resized based on aspect ratio)
    const geometry = new THREE.PlaneGeometry(160, 180);
    
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(58, 42, 30, 0.86)";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "rgba(221, 185, 103, 0.68)";
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, 472, 472);

    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      metalness: 0.2,
      roughness: 0.3,
      emissive: 0xddb967,
      emissiveIntensity: 0.5,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
  }

  loadImage(imageUrl) {
    // Create video element to play GIF
    if (!this.videoElement) {
      this.videoElement = document.createElement("video");
      this.videoElement.style.display = "none";
      this.videoElement.loop = true;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;
      this.videoElement.crossOrigin = "anonymous";
      document.body.appendChild(this.videoElement);
    }

    // Load the GIF as video
    this.videoElement.src = imageUrl;
    
    this.videoElement.addEventListener("loadedmetadata", () => {
      // Get aspect ratio from video
      this.gifAspectRatio = this.videoElement.videoWidth / this.videoElement.videoHeight;
      
      // Resize mesh based on aspect ratio
      this.resizeMeshToAspectRatio();
      
      // Create video texture for Three.js
      if (this.videoTexture) {
        this.videoTexture.dispose();
      }
      
      this.videoTexture = new THREE.VideoTexture(this.videoElement);
      this.videoTexture.encoding = THREE.sRGBEncoding;
      this.videoTexture.minFilter = THREE.LinearFilter;
      this.videoTexture.magFilter = THREE.LinearFilter;
      
      if (this.mesh && this.mesh.material) {
        this.mesh.material.map = this.videoTexture;
        this.mesh.material.emissiveIntensity = 0.6;
        this.mesh.material.metalness = 0.15;
        this.mesh.material.roughness = 0.2;
        this.mesh.material.needsUpdate = true;
      }

      // Start playing
      this.videoElement.play().catch((err) => {
        console.warn("Failed to autoplay GIF:", err);
      });
    }, { once: true });

    this.videoElement.addEventListener("error", (err) => {
      console.warn("Failed to load GIF:", err);
    });
  }

  resizeMeshToAspectRatio() {
    if (!this.mesh || this.gifAspectRatio <= 0) return;

    const maxWidth = 160;
    const maxHeight = 200;
    let width = maxWidth;
    let height = maxHeight;

    // Fit to aspect ratio
    if (this.gifAspectRatio > maxWidth / maxHeight) {
      // Wider image
      height = maxWidth / this.gifAspectRatio;
    } else {
      // Taller image
      width = maxHeight * this.gifAspectRatio;
    }

    // Recreate geometry with correct aspect ratio
    const newGeometry = new THREE.PlaneGeometry(width, height);
    this.mesh.geometry.dispose();
    this.mesh.geometry = newGeometry;
  }

  setupDeviceOrientation() {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      document.addEventListener("click", () => {
        DeviceOrientationEvent.requestPermission()
          .then((permission) => {
            if (permission === "granted") {
              window.addEventListener("deviceorientation", (e) => this.onDeviceOrientation(e));
            }
          })
          .catch((_err) => {});
      }, { once: true });
    } else if (typeof DeviceOrientationEvent !== "undefined") {
      window.addEventListener("deviceorientation", (e) => this.onDeviceOrientation(e));
    }
  }

  onDeviceOrientation(event) {
    this.deviceOrientation.alpha = event.alpha || 0;
    this.deviceOrientation.beta = event.beta || 0;
    this.deviceOrientation.gamma = event.gamma || 0;
  }

  updatePosition(screenX, screenY, scale) {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    // Convert screen coordinates to normalized device coordinates
    const normalizedX = (screenX / w) * 2 - 1;
    const normalizedY = -(screenY / h) * 2 + 1;

    // Map to 3D space
    this.targetPosition.x = normalizedX * 100;
    this.targetPosition.y = normalizedY * 75;
    this.targetPosition.z = 0;
    this.targetScale = Math.max(0.5, Math.min(2.5, scale));
  }

  show() {
    this.isVisible = true;
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.style.opacity = "1";
    }
    if (this.markerGroup) {
      this.markerGroup.visible = true;
    }
  }

  hide() {
    this.isVisible = false;
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.style.opacity = "0";
    }
    if (this.markerGroup) {
      this.markerGroup.visible = false;
    }
  }

  animate = () => {
    requestAnimationFrame(this.animate);

    if (!this.isInitialized || !this.mesh) return;

    // Update video texture
    if (this.videoTexture) {
      this.videoTexture.needsUpdate = true;
    }

    // Smooth interpolation
    const lerpFactor = 0.08;
    this.currentPosition.x += (this.targetPosition.x - this.currentPosition.x) * lerpFactor;
    this.currentPosition.y += (this.targetPosition.y - this.currentPosition.y) * lerpFactor;
    this.currentPosition.z += (this.targetPosition.z - this.currentPosition.z) * lerpFactor;
    this.currentScale += (this.targetScale - this.currentScale) * lerpFactor;

    // Apply device orientation for parallax
    const beta = this.deviceOrientation.beta || 0;
    const gamma = this.deviceOrientation.gamma || 0;

    // Update mesh position and rotation
    this.mesh.position.x = this.currentPosition.x;
    this.mesh.position.y = this.currentPosition.y;
    this.mesh.position.z = this.currentPosition.z;
    this.mesh.scale.set(this.currentScale, this.currentScale, 1);

    // Apply rotation based on device orientation
    this.currentRotation.x = lerp(this.currentRotation.x, beta * 0.005, 0.1);
    this.currentRotation.y = lerp(this.currentRotation.y, -gamma * 0.008, 0.1);
    this.currentRotation.z = lerp(this.currentRotation.z, 0, 0.1);

    this.mesh.rotation.x = this.currentRotation.x;
    this.mesh.rotation.y = this.currentRotation.y;
    this.mesh.rotation.z = this.currentRotation.z;

    // Gentle floating animation
    this.mesh.position.z += Math.sin(Date.now() * 0.001) * 0.3;

    // Update marker visibility and animation
    if (this.markerGroup) {
      this.markerGroup.position.copy(this.mesh.position);
      this.markerGroup.scale.set(this.currentScale, this.currentScale, 1);
      
      // Pulsing effect on marker
      const pulseAmount = Math.sin(Date.now() * 0.003) * 0.3;
      const markerLines = this.markerGroup.children;
      markerLines.forEach((line) => {
        line.material.opacity = 0.5 + pulseAmount * 0.3;
      });
    }

    // Enhance mesh glow when visible
    if (this.isVisible && this.mesh.material) {
      const glowIntensity = 0.5 + Math.sin(Date.now() * 0.002) * 0.2;
      this.mesh.material.emissiveIntensity = Math.max(0.3, glowIntensity);
    }

    this.renderer.render(this.scene, this.camera);
  };

  onWindowResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    // Clean up video element
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.src = "";
      if (this.videoElement.parentNode) {
        this.videoElement.parentNode.removeChild(this.videoElement);
      }
      this.videoElement = null;
    }

    // Clean up video texture
    if (this.videoTexture) {
      this.videoTexture.dispose();
      this.videoTexture = null;
    }

    // Clean up renderer
    if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer?.dispose();
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
