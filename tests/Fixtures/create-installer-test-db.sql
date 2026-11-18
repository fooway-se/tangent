CREATE DATABASE IF NOT EXISTS tangent_test_suite
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON tangent_test_suite.* TO 'tangent'@'%';

CREATE DATABASE IF NOT EXISTS tangent_installer_test
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON tangent_installer_test.* TO 'tangent'@'%';
